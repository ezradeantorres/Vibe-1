#!/usr/bin/env python3
"""
One-shot: bake live Netlify Blob overrides for the Hidden Gem site
into the static HTML files in hidden-gem/.

Eliminates the first-paint flash where pre-edit HTML shows briefly
before editor.js hydrates the latest content from Netlify Blobs.

Usage:
    pip install requests beautifulsoup4
    python scripts/bake_hidden_gem_edits.py

Run from the repo root. Modifies files in hidden-gem/ in place. Inspect
the diff (`git diff hidden-gem/`) before committing.

Existing Netlify Blob entries are NOT cleared. After baking, the editor
overlays them onto identical content at runtime, which is harmless.
The site-content blob continues to grow as contributors edit; bake again
when you want to flush new edits into static HTML.
"""

import os
import sys
import mimetypes
from pathlib import Path

import requests
from bs4 import BeautifulSoup

REPO_ROOT = Path(__file__).resolve().parent.parent
HIDDEN_GEM = REPO_ROOT / "hidden-gem"
EDITS_DIR = HIDDEN_GEM / "images" / "edits"

SITE = "https://hidden-gem-editable.netlify.app"
PAGE_FILES = [
    "index.html",
    "about.html",
    "abbey.html",
    "sara-equine.html",
    "sara-psychiatric.html",
]

# Mirror EDITABLE_SELECTOR in hidden-gem/js/editor.js. Keep in sync.
EDITABLE_SELECTORS = (
    "h1, h2, h3, h4, h5, h6, "
    "p, li, blockquote, figcaption, "
    "button, "
    "a.btn-primary, a.btn-secondary, a.btn-white, "
    "span.cred, div.hero-badge"
)

# Mirror EXT_EDITABLE_SELECTOR in editor.js. Keys land in `${page}:ext:N`
# and are indexed only over elements not already matched by the legacy
# selector — matching collectExtraEditables() behavior in JS.
EXT_EDITABLE_SELECTORS = (
    ".section-label, .persona-tag, .ps-eyebrow, "
    ".faq-q, .faq-a, "
    "footer h4, footer p, footer a, "
    "nav a, .nav-links a"
)


def get_page_key(soup):
    body = soup.find("body")
    if body and body.get("data-page"):
        return body["data-page"]
    return None


def is_skipped_text(el):
    # Mirror collectEditables() filters in editor.js.
    for parent in el.parents:
        if parent.get("id") == "hg-editor-ui":
            return True
    if (el.get("id") or "").startswith("hg-"):
        return True
    if not (el.get_text() or "").strip():
        return True
    return False


def is_skipped_img(img):
    for parent in img.parents:
        if parent.get("id") == "hg-editor-ui":
            return True
    return False


def collect_text_nodes(soup):
    return [el for el in soup.select(EDITABLE_SELECTORS) if not is_skipped_text(el)]


def collect_ext_text_nodes(soup, legacy_nodes):
    # Mirrors JS collectExtraEditables(): include ext-selector elements,
    # skipping any the legacy selector already matched (they keep their
    # legacy ${page}:N key, so the :ext: counter doesn't advance).
    legacy_ids = {id(n) for n in legacy_nodes}
    return [
        el for el in soup.select(EXT_EDITABLE_SELECTORS)
        if not is_skipped_text(el) and id(el) not in legacy_ids
    ]


def collect_img_nodes(soup):
    return [img for img in soup.find_all("img") if not is_skipped_img(img)]


def fetch_overrides(page_key):
    url = f"{SITE}/.netlify/functions/content?page={page_key}"
    print(f"  Fetching {url}")
    r = requests.get(url, timeout=20, headers={"cache-control": "no-store"})
    if r.status_code == 404:
        return {}
    r.raise_for_status()
    body = r.text.strip()
    if not body:
        return {}
    return r.json()


def download_image(override_value, key):
    # override_value is typically "/.netlify/functions/image?key=...&v=..."
    # or an absolute URL; resolve relative URLs against SITE.
    url = SITE + override_value if override_value.startswith("/") else override_value
    print(f"    Downloading {key} <- {url}")
    r = requests.get(url, timeout=30)
    r.raise_for_status()

    content_type = r.headers.get("content-type", "image/jpeg").split(";")[0].strip()
    ext = mimetypes.guess_extension(content_type) or ".jpg"
    if ext == ".jpe":
        ext = ".jpg"

    safe_key = key.replace(":", "_")
    EDITS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = EDITS_DIR / f"{safe_key}{ext}"
    out_path.write_bytes(r.content)
    return out_path


def apply_overrides(soup, overrides):
    text_nodes = collect_text_nodes(soup)
    ext_nodes = collect_ext_text_nodes(soup, text_nodes)
    img_nodes = collect_img_nodes(soup)
    text_count = ext_count = img_count = 0

    for key, val in overrides.items():
        parts = key.split(":")

        if ":img:" in key:
            try:
                idx = int(parts[-1])
            except ValueError:
                print(f"  ! Malformed image key, skipping: {key}")
                continue
            if idx >= len(img_nodes):
                print(f"  ! img idx {idx} out of range ({len(img_nodes)} imgs) for {key}")
                continue
            try:
                local = download_image(val, key)
            except Exception as exc:
                print(f"  ! Image download failed for {key}: {exc}")
                continue
            rel = os.path.relpath(local, HIDDEN_GEM).replace(os.sep, "/")
            img_nodes[idx]["src"] = rel
            img_count += 1
            continue

        if "ext" in parts:
            try:
                idx = int(parts[-1])
            except ValueError:
                print(f"  ! Malformed ext key, skipping: {key}")
                continue
            if idx >= len(ext_nodes):
                print(f"  ! ext idx {idx} out of range ({len(ext_nodes)} nodes) for {key}")
                continue
            target = ext_nodes[idx]
            target.clear()
            fragment = BeautifulSoup(val, "html.parser")
            for child in list(fragment.contents):
                target.append(child)
            ext_count += 1
            continue

        try:
            idx = int(parts[-1])
        except ValueError:
            print(f"  ! Malformed text key, skipping: {key}")
            continue
        if idx >= len(text_nodes):
            print(f"  ! text idx {idx} out of range ({len(text_nodes)} nodes) for {key}")
            continue

        target = text_nodes[idx]
        target.clear()
        fragment = BeautifulSoup(val, "html.parser")
        for child in list(fragment.contents):
            target.append(child)
        text_count += 1

    return text_count, ext_count, img_count


def main():
    if not HIDDEN_GEM.is_dir():
        sys.exit(f"hidden-gem/ not found at {HIDDEN_GEM}")

    grand_text = grand_ext = grand_img = 0
    for filename in PAGE_FILES:
        path = HIDDEN_GEM / filename
        if not path.is_file():
            print(f"  ! Missing file, skipping: {path}")
            continue

        print(f"\n=== {filename} ===")
        soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")

        page_key = get_page_key(soup)
        if not page_key:
            print(f"  ! No <body data-page=...>; skipping")
            continue

        try:
            overrides = fetch_overrides(page_key)
        except Exception as exc:
            print(f"  ! Fetch failed for '{page_key}': {exc}")
            continue

        if not overrides:
            print(f"  - No overrides for page '{page_key}'")
            continue

        print(f"  {len(overrides)} override(s) for page '{page_key}'")
        text_count, ext_count, img_count = apply_overrides(soup, overrides)

        path.write_text(str(soup), encoding="utf-8")
        print(f"  Wrote {filename}: {text_count} text, {ext_count} ext, {img_count} image baked")
        grand_text += text_count
        grand_ext += ext_count
        grand_img += img_count

    print(f"\nDone. {grand_text} text + {grand_ext} ext + {grand_img} image override(s) baked.")
    print("Inspect with `git diff hidden-gem/` before committing.")


if __name__ == "__main__":
    main()
