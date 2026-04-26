"""Agent 2 — Scraper.

For one or more communities flagged "bad" by the auditor, render the page
with Playwright, save the HTML, discover and download photos. Per
PROJECT_PLAN.md §8.

Deterministic work done here:
- Render the page (networkidle -> domcontentloaded fallback).
- Save rendered HTML to work/scrapes/{slug}/rendered.html.
- Walk the DOM (BeautifulSoup) for <img src>, srcset (largest), and inline
  background-image URLs. Filter out logos/icons/SVGs by name.
- Download up to 12 candidate photos. After download, re-filter by actual
  pixel size: skip < 800x600, prefer landscape over portrait when capping.
- Write a partial ScrapeResult JSON to work/scrapes/{slug}/scrape.json with
  photos, source_url, and identifiers populated. The text fields (services,
  amenities, about_text, staff, hours, existing_copy_blocks) are left empty
  — the in-session Claude Code agent reads rendered.html and fills them in.

Usage:
    python -m src.scrape data/selected_for_mvp.csv \\
        [--only slug1,slug2] [--limit N]
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from PIL import Image, UnidentifiedImageError

from src.lib.paths import (
    SCRAPE_DIR,
    REPO_ROOT,
    scrape_dir,
    scrape_html_path,
    scrape_json_path,
    scrape_photos_dir,
    slugify,
)
from src.lib.schema import ScrapedPhoto, ScrapeResult

NAV_TIMEOUT_MS = 25000
PHOTO_DL_TIMEOUT_S = 20
MAX_PHOTOS = 12
MIN_PHOTO_W = 800
MIN_PHOTO_H = 600
MAX_DOWNLOAD_CANDIDATES = 40  # cap on URLs we'll attempt to download

LOGO_OR_ICON_RE = re.compile(r"\b(logo|icon|favicon|sprite|wordmark|badge|seal)\b", re.IGNORECASE)
URL_PROTO_RE = re.compile(r"^(https?:|data:)")


def _largest_from_srcset(srcset: str) -> Optional[str]:
    """Pick the largest URL from a srcset value, by w-descriptor or x-descriptor."""
    best: tuple[float, str] | None = None
    for entry in srcset.split(","):
        entry = entry.strip()
        if not entry:
            continue
        parts = entry.split()
        url = parts[0]
        weight = 1.0
        if len(parts) >= 2:
            tag = parts[1]
            if tag.endswith("w"):
                try:
                    weight = float(tag[:-1])
                except ValueError:
                    pass
            elif tag.endswith("x"):
                try:
                    weight = float(tag[:-1]) * 1000
                except ValueError:
                    pass
        if best is None or weight > best[0]:
            best = (weight, url)
    return best[1] if best else None


def _extract_bg_urls(style: str) -> list[str]:
    """Pull URLs out of inline `background-image: url(...)` declarations."""
    urls: list[str] = []
    for m in re.finditer(r"url\((['\"]?)([^'\")]+)\1\)", style or ""):
        urls.append(m.group(2))
    return urls


def discover_photo_urls(html: str, base_url: str) -> list[tuple[str, str]]:
    """Return (absolute_url, alt_text) tuples, deduped, with logos/icons/SVGs
    filtered out. Order roughly mirrors document order so hero images come
    first."""
    soup = BeautifulSoup(html, "html.parser")
    seen: set[str] = set()
    out: list[tuple[str, str]] = []

    def maybe_add(raw: str, alt: str) -> None:
        if not raw:
            return
        url = raw.strip()
        if not URL_PROTO_RE.match(url):
            url = urljoin(base_url, url)
        # Skip data URIs and SVG
        if url.startswith("data:"):
            return
        if url.lower().endswith((".svg", ".gif")):
            return
        if LOGO_OR_ICON_RE.search(url):
            return
        if url in seen:
            return
        seen.add(url)
        out.append((url, alt or ""))

    for img in soup.find_all("img"):
        srcset = img.get("srcset") or img.get("data-srcset") or ""
        chosen = _largest_from_srcset(srcset) if srcset else None
        src = chosen or img.get("src") or img.get("data-src") or ""
        alt = img.get("alt", "") or ""
        if LOGO_OR_ICON_RE.search(alt):
            continue
        maybe_add(src, alt)

    for el in soup.find_all(style=True):
        for url in _extract_bg_urls(el.get("style", "")):
            maybe_add(url, "")

    for src_tag in soup.find_all("source"):
        srcset = src_tag.get("srcset", "")
        chosen = _largest_from_srcset(srcset) if srcset else None
        if chosen:
            maybe_add(chosen, "")

    return out[:MAX_DOWNLOAD_CANDIDATES]


def render_page(url: str) -> Optional[str]:
    """Render with Playwright iPhone emulation; return HTML or None on failure.

    iPhone emulation matches the audit; produces consistent DOM for sites
    that render mobile-first vs. desktop-first differently.
    """
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            context = browser.new_context(**p.devices["iPhone 12"])
            page = context.new_page()
            try:
                page.goto(url, wait_until="networkidle", timeout=NAV_TIMEOUT_MS)
            except Exception:
                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
                except Exception:
                    return None
            # Allow late-binding hero carousels to settle
            try:
                page.wait_for_timeout(2500)
            except Exception:
                pass
            try:
                return page.content()
            except Exception:
                return None
        finally:
            browser.close()


def download_photo(client: httpx.Client, url: str, dest_dir: Path, idx: int) -> Optional[Path]:
    """Stream a photo to disk. Extension picked from Content-Type, then URL
    suffix as fallback. Returns the saved path or None on failure."""
    try:
        with client.stream("GET", url, timeout=PHOTO_DL_TIMEOUT_S) as r:
            r.raise_for_status()
            ct = (r.headers.get("content-type") or "").split(";")[0].strip().lower()
            ext = {
                "image/jpeg": ".jpg",
                "image/jpg": ".jpg",
                "image/png": ".png",
                "image/webp": ".webp",
                "image/avif": ".avif",
            }.get(ct)
            if ext is None:
                suffix = Path(urlparse(url).path).suffix.lower()
                if suffix in (".jpg", ".jpeg", ".png", ".webp", ".avif"):
                    ext = ".jpg" if suffix == ".jpeg" else suffix
                else:
                    return None
            path = dest_dir / f"{idx:02d}{ext}"
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("wb") as f:
                for chunk in r.iter_bytes(chunk_size=64 * 1024):
                    f.write(chunk)
            return path
    except (httpx.HTTPError, OSError):
        return None


def measure_photo(path: Path) -> Optional[tuple[int, int]]:
    try:
        with Image.open(path) as im:
            im.verify()
        with Image.open(path) as im:
            return im.size  # (width, height)
    except (UnidentifiedImageError, OSError):
        return None


def is_landscape(w: int, h: int) -> bool:
    return w >= h


def gather_photos(html: str, base_url: str, slug: str) -> list[ScrapedPhoto]:
    """Discover, download, measure, filter, and cap photos for one community."""
    candidates = discover_photo_urls(html, base_url)
    if not candidates:
        return []

    dest_dir = scrape_photos_dir(slug)
    dest_dir.mkdir(parents=True, exist_ok=True)

    survivors: list[ScrapedPhoto] = []
    landscape_count = 0
    portrait_pool: list[ScrapedPhoto] = []  # only used if we run short on landscape

    with httpx.Client(
        follow_redirects=True,
        headers={"User-Agent": "silverlist-scrape/0.1"},
    ) as client:
        for idx, (url, alt) in enumerate(candidates):
            if landscape_count >= MAX_PHOTOS:
                break
            saved = download_photo(client, url, dest_dir, idx)
            if saved is None:
                continue
            size = measure_photo(saved)
            if size is None:
                try:
                    saved.unlink()
                except OSError:
                    pass
                continue
            w, h = size
            if w < MIN_PHOTO_W or h < MIN_PHOTO_H:
                try:
                    saved.unlink()
                except OSError:
                    pass
                continue

            photo = ScrapedPhoto(
                src_url=url,
                alt=alt,
                downloaded_path=str(saved.relative_to(REPO_ROOT)),
                width=w,
                height=h,
            )
            if is_landscape(w, h):
                survivors.append(photo)
                landscape_count += 1
            else:
                portrait_pool.append(photo)

    # If we didn't reach MAX_PHOTOS landscape, top up with portraits.
    if len(survivors) < MAX_PHOTOS:
        survivors.extend(portrait_pool[: MAX_PHOTOS - len(survivors)])

    return survivors[:MAX_PHOTOS]


def scrape_one(row: dict[str, str]) -> Optional[ScrapeResult]:
    name = (row.get("name") or "").strip()
    url = (row.get("website") or "").strip()
    monday_id = (row.get("monday_item_id") or "").strip()
    if not name or not url:
        return None

    slug = slugify(name)

    html = render_page(url)
    if html is None:
        print(f"  ! render failed: {url}", file=sys.stderr)
        return None

    scrape_dir(slug).mkdir(parents=True, exist_ok=True)
    scrape_html_path(slug).write_text(html, encoding="utf-8")
    photos = gather_photos(html, url, slug)

    return ScrapeResult(
        monday_item_id=monday_id,
        slug=slug,
        name=name,
        photos=photos,
        source_url=url,
        fetched_at=datetime.now(tz=timezone.utc),
    )


def _read_csv(csv_path: Path) -> list[dict[str, str]]:
    with csv_path.open(encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Scrape rendered HTML + photos from community sites.")
    parser.add_argument("csv", type=Path)
    parser.add_argument("--only", default="")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args(argv)

    rows = _read_csv(args.csv)
    if args.only:
        wanted = {s.strip() for s in args.only.split(",") if s.strip()}
        rows = [r for r in rows if slugify((r.get("name") or "").strip()) in wanted]
    if args.limit > 0:
        rows = rows[: args.limit]

    if not rows:
        print("No rows to scrape.", file=sys.stderr)
        return 1

    SCRAPE_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Scraping {len(rows)} communities...")
    awaiting_extraction: list[str] = []
    for i, row in enumerate(rows, 1):
        name = (row.get("name") or "").strip()
        slug = slugify(name) if name else f"row{i}"
        print(f"[{i}/{len(rows)}] {name}  ({slug})")
        try:
            result = scrape_one(row)
        except Exception as e:
            print(f"  ERROR: {e}", file=sys.stderr)
            continue
        if result is None:
            continue
        json_path = scrape_json_path(slug)
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(result.model_dump_json(indent=2))
        print(f"  photos={len(result.photos)}  html={scrape_html_path(slug).relative_to(REPO_ROOT)}")
        awaiting_extraction.append(slug)

    print()
    print(f"Wrote partial scrape JSONs for {len(awaiting_extraction)} communities under {SCRAPE_DIR.relative_to(REPO_ROOT)}/.")
    print("In-session work pending: read each rendered.html and fill in services,")
    print("amenities, about_text, staff, hours, phone, address, existing_copy_blocks.")
    for s in awaiting_extraction:
        print(f"  - {scrape_html_path(s).relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
