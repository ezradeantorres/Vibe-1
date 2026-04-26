from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

DATA_DIR = REPO_ROOT / "data"
WORK_DIR = REPO_ROOT / "work"
PUBLIC_DIR = REPO_ROOT / "public"
OUT_DIR = REPO_ROOT / "out"

AUDIT_DIR = WORK_DIR / "audits"
SCRAPE_DIR = WORK_DIR / "scrapes"
SITES_DIR = WORK_DIR / "sites"

COMMUNITIES_CSV = DATA_DIR / "utah_communities.csv"
SELECTED_CSV = DATA_DIR / "selected_for_mvp.csv"
MANIFEST_JSON = OUT_DIR / "manifest.json"


_SLUG_NONWORD = re.compile(r"[^a-z0-9]+")


def slugify(name: str) -> str:
    """Lowercased, non-alphanumeric collapsed to a single hyphen.

    Per PROJECT_PLAN.md §6: "Legacy House of Ogden" -> "legacy-house-of-ogden".
    """
    s = _SLUG_NONWORD.sub("-", name.lower()).strip("-")
    if not s:
        raise ValueError(f"slugify produced empty string from {name!r}")
    return s


def audit_screenshot_path(slug: str) -> Path:
    return AUDIT_DIR / f"{slug}.png"


def audit_json_path(slug: str) -> Path:
    return AUDIT_DIR / f"{slug}.json"


def scrape_dir(slug: str) -> Path:
    return SCRAPE_DIR / slug


def scrape_json_path(slug: str) -> Path:
    return scrape_dir(slug) / "scrape.json"


def scrape_html_path(slug: str) -> Path:
    return scrape_dir(slug) / "rendered.html"


def scrape_photos_dir(slug: str) -> Path:
    return scrape_dir(slug) / "photos"


def site_bundle_dir(slug: str) -> Path:
    return SITES_DIR / slug


def public_site_dir(slug: str) -> Path:
    """Final deploy location: public/<slug>/, served by Netlify."""
    return PUBLIC_DIR / slug
