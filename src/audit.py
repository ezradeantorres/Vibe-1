"""Agent 1 — Auditor.

Reads a CSV of communities, audits each website against PROJECT_PLAN.md §7,
writes one work/audits/{slug}.json per community plus a screenshot.

Deterministic checks done here:
- site_loads: HTTP request + Playwright render success.
- mobile_responsive: 375x812 viewport, no horizontal scroll, body font >= 14px.
- owns_identity: URL host not in directory-listing blacklist.
- recent_update_signal: copyright/footer year regex over rendered HTML.
- lighthouse_perf: best-effort `npx lighthouse` subprocess (None on failure).

Deferred to the in-session Claude Code agent (per CLAUDE.md Phase 1
deviation): primary_cta_above_fold. The script writes the screenshot
and leaves AuditScores.primary_cta_above_fold = None and AuditResult.is_bad
= None. The agent reviews the screenshot, fills the field, and recomputes
is_bad via finalize_audit() (helper exposed below for that flow).

Usage:
    python -m src.audit data/utah_communities.csv \\
        [--only slug1,slug2] [--limit N]
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import httpx

from src.lib.paths import (
    AUDIT_DIR,
    audit_json_path,
    audit_screenshot_path,
    slugify,
)
from src.lib.schema import AuditResult, AuditScores

# Hosts that mean the community does NOT own its identity (PROJECT_PLAN §7.3).
# Substring match against the URL host (lowercased).
DIRECTORY_HOSTS: tuple[str, ...] = (
    "aplaceformom.com",
    "caring.com",
    "seniorhousingnet.com",
    "seniorliving.org",
    "retirement.com",
    "senioradvisor.com",
    "yelp.com",
    "facebook.com",
    "fb.com",
    "google.com",
    "goo.gl",
    "linkedin.com",
)

# Years older than this are stale signals (PROJECT_PLAN §7.5).
# Today is 2026; "older than 2023" means year <= 2022.
RECENT_YEAR_CUTOFF = 2023

COPYRIGHT_RE = re.compile(
    r"(?:&copy;|©|copyright)\s*(\d{4})(?:\s*[-–—]\s*(\d{4}))?",
    re.IGNORECASE,
)
# Fallback: any 4-digit year in a footer-ish phrase
FOOTER_YEAR_RE = re.compile(
    r"(?:all rights reserved|rights reserved|©|&copy;|copyright)[^0-9]{0,40}(\d{4})",
    re.IGNORECASE,
)

LIGHTHOUSE_TIMEOUT_S = 60
NAV_TIMEOUT_MS = 20000


def check_owns_identity(url: str) -> bool:
    """True if the URL's host is NOT a known directory-listing site."""
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return False
    if not host:
        return False
    return not any(d in host for d in DIRECTORY_HOSTS)


def check_recent_update_signal(html: str) -> tuple[bool, Optional[int]]:
    """(passes, latest_year_found_or_None). Passes if no year found OR latest >= cutoff."""
    years: list[int] = []
    for m in COPYRIGHT_RE.finditer(html):
        for grp in m.groups():
            if grp:
                try:
                    years.append(int(grp))
                except ValueError:
                    pass
    for m in FOOTER_YEAR_RE.finditer(html):
        try:
            years.append(int(m.group(1)))
        except (ValueError, IndexError):
            pass
    if not years:
        return True, None
    latest = max(years)
    return latest >= RECENT_YEAR_CUTOFF, latest


def check_site_loads(url: str) -> tuple[bool, Optional[int]]:
    """Best-effort HTTP probe. (loaded, status_code)."""
    try:
        with httpx.Client(follow_redirects=True, timeout=15.0) as client:
            r = client.get(url, headers={"User-Agent": "silverlist-audit/0.1"})
            return (200 <= r.status_code < 400), r.status_code
    except Exception:
        return False, None


def run_lighthouse(url: str) -> Optional[int]:
    """Best-effort Lighthouse mobile perf score, 0-100. None on any error."""
    cmd = [
        "npx", "--yes", "lighthouse", url,
        "--emulated-form-factor=mobile",
        "--output=json",
        "--quiet",
        "--only-categories=performance",
        "--chrome-flags=--headless --no-sandbox --disable-gpu",
    ]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=LIGHTHOUSE_TIMEOUT_S,
        )
        if proc.returncode != 0:
            return None
        data = json.loads(proc.stdout)
        score = data.get("categories", {}).get("performance", {}).get("score")
        if score is None:
            return None
        return int(round(float(score) * 100))
    except (subprocess.TimeoutExpired, json.JSONDecodeError, ValueError, OSError):
        return None


def render_and_check_mobile(url: str, screenshot_path: Path) -> tuple[bool, str, bool, list[str]]:
    """Launch Chromium with iPhone 12 emulation, render the page, screenshot it,
    and check no-horizontal-scroll + body-font-size >= 14px.

    Returns (loaded_ok, rendered_html, mobile_responsive, mobile_failure_reasons).
    """
    from playwright.sync_api import sync_playwright

    failures: list[str] = []
    loaded_ok = False
    rendered_html = ""
    mobile_responsive = False

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            context = browser.new_context(**p.devices["iPhone 12"])
            page = context.new_page()
            try:
                page.goto(url, wait_until="networkidle", timeout=NAV_TIMEOUT_MS)
                loaded_ok = True
            except Exception:
                # Fall back to a less-strict wait
                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
                    loaded_ok = True
                except Exception:
                    return False, "", False, ["nav_timeout"]

            screenshot_path.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(screenshot_path), full_page=False)

            try:
                rendered_html = page.content()
            except Exception:
                rendered_html = ""

            try:
                metrics = page.evaluate(
                    """() => {
                        const docW = document.documentElement.scrollWidth;
                        const winW = window.innerWidth;
                        const fontSizeStr = getComputedStyle(document.body).fontSize || '0';
                        const fontSize = parseFloat(fontSizeStr);
                        return { docW, winW, fontSize };
                    }"""
                )
                horiz_overflow = metrics["docW"] > metrics["winW"] + 16
                small_text = metrics["fontSize"] < 14
                if horiz_overflow:
                    failures.append("horizontal_scroll")
                if small_text:
                    failures.append("body_text_too_small")
                mobile_responsive = not failures
            except Exception:
                failures.append("metrics_eval_failed")

        finally:
            browser.close()

    return loaded_ok, rendered_html, mobile_responsive, failures


def audit_one(row: dict[str, str]) -> AuditResult:
    """Run all deterministic checks for one community row."""
    name = (row.get("name") or "").strip()
    url = (row.get("website") or "").strip()
    monday_id = (row.get("monday_item_id") or "").strip()

    if not name or not url:
        raise ValueError(f"row missing name or website: {row!r}")

    slug = slugify(name)
    screenshot_path = audit_screenshot_path(slug)

    critical_failures: list[str] = []
    standard_failures: list[str] = []
    notes_lines: list[str] = []

    # 1. site loads (HTTP)
    http_ok, status_code = check_site_loads(url)
    if not http_ok:
        critical_failures.append("site_does_not_load")
        notes_lines.append(f"HTTP probe failed; status_code={status_code}")

    # 2. mobile-responsive — also produces screenshot + rendered HTML
    rendered_html = ""
    mobile_ok = False
    if http_ok:
        try:
            loaded_ok, rendered_html, mobile_ok, mobile_fail = render_and_check_mobile(url, screenshot_path)
            if not loaded_ok:
                critical_failures.append("playwright_render_failed")
                notes_lines.append("Playwright failed to render the page after fallback")
            elif not mobile_ok:
                critical_failures.append("mobile_responsive_fail")
                notes_lines.extend(f"mobile-responsive: {f}" for f in mobile_fail)
        except Exception as e:
            critical_failures.append("playwright_render_failed")
            notes_lines.append(f"Playwright exception: {e!s}")

    # 3. owns identity
    owns_identity = check_owns_identity(url)
    if not owns_identity:
        critical_failures.append("does_not_own_identity")
        notes_lines.append(f"Host appears to be a directory listing: {urlparse(url).hostname}")

    # 5. recent update signal (skip 4 / primary_cta_above_fold; that's manual)
    recent_signal_ok = True
    latest_year: Optional[int] = None
    if rendered_html:
        recent_signal_ok, latest_year = check_recent_update_signal(rendered_html)
        if not recent_signal_ok:
            standard_failures.append("stale_copyright_year")
            notes_lines.append(f"Latest copyright year found: {latest_year}")

    # 6. Lighthouse
    lh_score: Optional[int] = None
    if http_ok:
        lh_score = run_lighthouse(url)
        if lh_score is None:
            notes_lines.append("Lighthouse skipped or failed")
        elif lh_score < 50:
            standard_failures.append("low_lighthouse_score")

    scores = AuditScores(
        site_loads=http_ok,
        mobile_responsive=mobile_ok,
        owns_identity=owns_identity,
        primary_cta_above_fold=None,  # filled in by in-session agent
        recent_update_signal=recent_signal_ok,
        lighthouse_perf=lh_score,
    )

    return AuditResult(
        monday_item_id=monday_id,
        name=name,
        slug=slug,
        url=url,
        fetched_at=datetime.now(tz=timezone.utc),
        status_code=status_code,
        is_bad=None,  # deferred to finalize_audit()
        critical_failures=critical_failures,
        standard_failures=standard_failures,
        scores=scores,
        screenshot_path=str(screenshot_path.relative_to(screenshot_path.parents[2])),
        notes="\n".join(notes_lines),
    )


def finalize_audit(audit: AuditResult, primary_cta_above_fold: bool) -> AuditResult:
    """After the in-session agent reviews the screenshot, supply the CTA verdict
    and recompute is_bad.

    is_bad rule (PROJECT_PLAN §7): True if any critical fails, OR 3+ standards fail.
    """
    scores = audit.scores.model_copy(update={"primary_cta_above_fold": primary_cta_above_fold})
    standard_failures = list(audit.standard_failures)
    if not primary_cta_above_fold and "no_primary_cta_above_fold" not in standard_failures:
        standard_failures.append("no_primary_cta_above_fold")

    is_bad = bool(audit.critical_failures) or len(standard_failures) >= 3

    return audit.model_copy(update={
        "scores": scores,
        "standard_failures": standard_failures,
        "is_bad": is_bad,
    })


def _read_csv(csv_path: Path) -> list[dict[str, str]]:
    with csv_path.open(encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Audit senior-living community websites.")
    parser.add_argument("csv", type=Path, help="Path to communities CSV.")
    parser.add_argument("--only", default="", help="Comma-separated slugs to audit (ignore others).")
    parser.add_argument("--limit", type=int, default=0, help="If >0, audit only the first N rows.")
    args = parser.parse_args(argv)

    rows = _read_csv(args.csv)
    if args.only:
        wanted = {s.strip() for s in args.only.split(",") if s.strip()}
        rows = [r for r in rows if slugify((r.get("name") or "").strip()) in wanted]
    if args.limit > 0:
        rows = rows[: args.limit]

    if not rows:
        print("No rows to audit.", file=sys.stderr)
        return 1

    AUDIT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Auditing {len(rows)} communities...")
    pending_review: list[str] = []
    for i, row in enumerate(rows, 1):
        name = (row.get("name") or "").strip()
        slug = slugify(name) if name else f"row{i}"
        print(f"[{i}/{len(rows)}] {name}  ({slug})")
        try:
            audit = audit_one(row)
        except Exception as e:
            print(f"  ERROR: {e}", file=sys.stderr)
            continue
        json_path = audit_json_path(slug)
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(audit.model_dump_json(indent=2))
        crit = ",".join(audit.critical_failures) or "-"
        std = ",".join(audit.standard_failures) or "-"
        lh = audit.scores.lighthouse_perf if audit.scores.lighthouse_perf is not None else "?"
        print(f"  http={audit.status_code}  mobile={audit.scores.mobile_responsive}  "
              f"identity={audit.scores.owns_identity}  recent={audit.scores.recent_update_signal}  "
              f"lh={lh}  crit=[{crit}]  std=[{std}]")
        pending_review.append(audit.screenshot_path)

    print()
    print(f"Wrote {len(pending_review)} audit JSONs to {AUDIT_DIR.relative_to(AUDIT_DIR.parents[1])}/.")
    print("Manual review pending: open each screenshot and decide primary_cta_above_fold,")
    print("then call finalize_audit() in a Claude Code session to fill it in.")
    for p in pending_review:
        print(f"  - {p}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
