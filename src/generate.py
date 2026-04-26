"""Phase 1 generator: render the warm_traditional template for one community.

Reads:
- work/audits/<slug>.json     (AuditResult)
- work/scrapes/<slug>/scrape.json   (ScrapeResult)
- work/copy/<slug>.json       (CopyResult — produced manually by the in-session agent)

Writes:
- public/<slug>/index.html
- public/<slug>/styles.css       (copied from template)
- public/<slug>/<photo>          (only photos referenced by hero_image_path or photo_gallery_paths)
- out/manifest.json              (upserts the entry for <slug>)

PROJECT_PLAN.md §9 (quality bar) and §13 (compliance) are enforced by the template
and CopyResult constraints (no medical claims, no specific pricing, no invented staff,
no inflammatory testimonials). The template uses the design language from
Dashboard/sunflower-ridge.html (Inter + Fraunces, deep ink-bg + sage + amber palette,
rich section composition).
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import quote as urlquote

from jinja2 import Environment, FileSystemLoader

from src.lib.paths import (
    REPO_ROOT,
    OUT_DIR,
    MANIFEST_JSON,
    audit_json_path,
    scrape_json_path,
    public_site_dir,
)
from src.lib.schema import (
    AuditResult,
    ScrapeResult,
    CopyResult,
    Manifest,
    ManifestEntry,
)

TEMPLATE_DIR = REPO_ROOT / "src" / "templates" / "warm_traditional"
COPY_DIR = REPO_ROOT / "work" / "copy"


# ───────── Inline SVGs (kept tiny, no external requests) ─────────

ICONS: dict[str, str] = {
    "phone": (
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">'
        '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" stroke-linecap="round" stroke-linejoin="round"/>'
        '</svg>'
    ),
    "mail": (
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">'
        '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>'
    ),
    "clock": (
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">'
        '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" stroke-linecap="round"/></svg>'
    ),
    "pin": (
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">'
        '<path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z"/>'
        '<circle cx="12" cy="9" r="2.5"/></svg>'
    ),
    "arrow_right": (
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">'
        '<path d="M5 12h14M13 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    ),
    "check": (
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">'
        '<path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    ),
    "dot": (
        '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
        '<circle cx="12" cy="12" r="4"/></svg>'
    ),
}


FAVICON_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
    '<circle cx="16" cy="16" r="5" fill="#1F2A1D"/>'
    '<g fill="#5E7142">'
    '<ellipse cx="16" cy="6" rx="3" ry="5"/>'
    '<ellipse cx="16" cy="26" rx="3" ry="5"/>'
    '<ellipse cx="6" cy="16" rx="5" ry="3"/>'
    '<ellipse cx="26" cy="16" rx="5" ry="3"/>'
    '<ellipse cx="9" cy="9" rx="4" ry="3" transform="rotate(-45 9 9)"/>'
    '<ellipse cx="23" cy="9" rx="4" ry="3" transform="rotate(45 23 9)"/>'
    '<ellipse cx="9" cy="23" rx="4" ry="3" transform="rotate(45 9 23)"/>'
    '<ellipse cx="23" cy="23" rx="4" ry="3" transform="rotate(-45 23 23)"/>'
    '</g></svg>'
)


# ───────── Defaults: section copy + Unsplash hero/care fallbacks ─────────

CARE_CARD_TAGS = {
    "independent_living": "For active seniors",
    "assisted_living":    "For daily-life support",
    "memory_care":        "For dementia & Alzheimer's",
    "respite_care":       "Short-term stays",
    "skilled_nursing":    "Higher-acuity care",
    "adult_day_care":     "Daytime support",
}

# Unsplash CC0-licensed photos that work as defaults. Each community can override
# via its CopyResult.photo_gallery_paths or by dropping real photos into
# work/scrapes/<slug>/photos/. Picsum.photos provides a deterministic fallback.
_DEFAULT_HERO_PHOTOS = [
    # Warm interior with natural light — works for most senior-living vibes
    "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=2000&q=80&auto=format&fit=crop",
]

# Default photo used in the welcome section when CopyResult doesn't provide one.
# Falls back to copy.photo_gallery_paths[0] before this if available.
_DEFAULT_WELCOME_PHOTO = "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=900&q=80&auto=format&fit=crop"

# Per-service care-card photos. Values must be senior-living-appropriate Unsplash
# URLs that have been visually verified — random Unsplash IDs return wildly off-topic
# images (cityscapes, food, microscopes). Until each is human-checked, we leave the
# entry None and let the template fall back to a tinted gradient placeholder.
CARE_CARD_DEFAULT_PHOTOS: dict[str, Optional[str]] = {
    "independent_living": None,
    "assisted_living":    "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=900&q=80&auto=format&fit=crop",
    "memory_care":        "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=900&q=80&auto=format&fit=crop",
    "respite_care":       "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=900&q=80&auto=format&fit=crop",
    "skilled_nursing":    None,
    "adult_day_care":     "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=900&q=80&auto=format&fit=crop",
}

DEFAULT_PLACEHOLDER_GALLERY_CAPTIONS = [
    "Around the community",
    "Daily life",
    "Outside spaces",
    "Quiet corners",
    "Shared meals",
    "Gathering places",
]


# ───────── Helpers ─────────

def _basename(p: str) -> str:
    return Path(p).name


def _img_src(p: Optional[str]) -> str:
    """Resolve a CopyResult image reference to a renderable <img src=> value.

    - Absolute URLs (http://, https://) pass through unchanged.
    - Anything else is treated as repo-relative and reduced to the bundle-local
      filename (the actual file is copied alongside index.html by generate.py).
    """
    if not p:
        return ""
    if p.startswith(("http://", "https://", "//")):
        return p
    return "./" + Path(p).name


def _tel_href(phone: str) -> str:
    """Strip a phone number to digits prefixed with +1 for tel: links."""
    digits = re.sub(r"\D", "", phone or "")
    if not digits:
        return ""
    if not digits.startswith("1") and len(digits) == 10:
        digits = "1" + digits
    return "+" + digits


def _city_state_from_address(address: Optional[str]) -> Optional[str]:
    if not address:
        return None
    parts = [p.strip() for p in address.split(",")]
    if len(parts) >= 2:
        city = parts[-2]
        state_zip = parts[-1].strip().split()
        if state_zip:
            return f"{city}, {state_zip[0]}"
    return None


def _split_brand(name: str) -> tuple[str, Optional[str]]:
    """Split community name into 'first' + optional 'second' for the
    'Sunflower **Ridge**' rendering. Drops common suffixes like
    'Senior Living' / 'Assisted Living'."""
    drop_re = re.compile(
        r"\s+(senior\s+living|assisted\s+living|memory\s+care|"
        r"residences?|community|home)$",
        re.IGNORECASE,
    )
    cleaned = drop_re.sub("", name).strip()
    parts = cleaned.split(" ", 1)
    if len(parts) == 1:
        return parts[0], None
    return parts[0], parts[1]


def _summarize_audit(audit: AuditResult) -> str:
    if not audit.is_bad:
        return "Existing site appears to meet our rubric."
    bits = []
    if "site_does_not_load" in audit.critical_failures:
        bits.append("the site does not load reliably (TLS or network errors)")
    if not audit.scores.mobile_responsive:
        bits.append("the page is not mobile-responsive")
    if not audit.scores.owns_identity:
        bits.append("the community does not have its own first-party site")
    if "no_primary_cta_above_fold" in audit.standard_failures:
        bits.append("there is no clear tour CTA above the fold")
    if "low_lighthouse_score" in audit.standard_failures:
        bits.append(f"mobile performance is low (Lighthouse {audit.scores.lighthouse_perf})")
    if not audit.scores.recent_update_signal:
        bits.append("the site looks out of date")
    if not bits:
        return "Existing site fails one or more rubric criteria."
    head = bits[0]
    rest = bits[1:]
    if not rest:
        return f"Existing site is flagged because {head}."
    if len(rest) == 1:
        return f"Existing site is flagged because {head}, and {rest[0]}."
    return f"Existing site is flagged because {head}, " + ", ".join(rest[:-1]) + f", and {rest[-1]}."


# ───────── Render context ─────────

def _render_context(
    *,
    audit: AuditResult,
    scrape: ScrapeResult,
    copy: CopyResult,
    photo_files_present: list[str],
) -> dict:
    name = scrape.name
    brand_first, brand_second = _split_brand(name)

    city_state = _city_state_from_address(scrape.address) or "Senior Living"
    location_label = f"Senior Living · {city_state}" if city_state != "Senior Living" else "Senior Living"
    eyebrow_text = f"Family-Owned · {city_state}" if city_state != "Senior Living" else "Family-Owned"

    # Resolve hero / gallery references. Three valid kinds:
    #   1. Absolute URL (http(s)://…) — passed through to <img src=> as-is.
    #   2. Repo-relative local path that exists on disk — copied into the bundle
    #      and referenced by basename.
    #   3. Repo-relative path missing on disk — dropped (template falls back).
    def _resolve(p: Optional[str]) -> Optional[str]:
        if not p:
            return None
        if p.startswith(("http://", "https://", "//")):
            return p
        return p if p in photo_files_present else None

    resolved_hero = _resolve(copy.hero_image_path) or _DEFAULT_HERO_PHOTOS[0]
    resolved_gallery = [r for r in (_resolve(p) for p in (copy.photo_gallery_paths or [])) if r]
    rendered_copy = copy.model_copy(update={
        "hero_image_path": resolved_hero,
        "photo_gallery_paths": resolved_gallery,
    })

    care_card_images = {}
    for s in copy.services:
        # If a per-service photo was scraped (future), use it; else use Unsplash default.
        care_card_images[s.key] = CARE_CARD_DEFAULT_PHOTOS.get(s.key)

    # Default section headlines/intros — Sunflower-Ridge-style voice but generic enough
    # to apply to other communities. Per-community overrides happen via copy fields.
    care_headline = "Care that meets your parent <em class=\"serif\">where they are.</em>"
    care_intro = (
        "We meet residents where they are today and adapt as life changes — "
        "with the same staff who know them, in the same place that's already home."
    )
    way_headline = "Three things we do <em class=\"way__title-mark\">differently</em>."
    way_intro = (
        "We're not optimizing for scale. We're optimizing for the experience of "
        "one resident, on one ordinary Tuesday."
    )
    amenities_headline = "Everything below, every month — <em class=\"serif\">no upcharges.</em>"
    amenities_intro = (
        "We bundle daily life into one straightforward monthly fee — meals, "
        "housekeeping, activities, care, and the things you don't think about."
    )
    gallery_headline = "Take a look around."
    gallery_intro = "A few moments from inside the community."
    pricing_headline = "No move-in fees. <em class=\"serif\" style=\"color:var(--sage-tint-2);\">No hidden upcharges.</em>"
    pricing_default_intro = (
        "One straightforward monthly rate. Care, housekeeping, meals, and activities "
        "are bundled — no add-ons, no surprises."
    )
    visit_headline = "Sit on the porch. <em class=\"serif\">Stay for tea.</em>"
    visit_intro = (
        "The fastest way to know if a place is right is to walk through it. "
        "Tell us a little about who you're researching for and we'll tailor the visit."
    )
    welcome_headline = (
        f"A different kind of home — <em class=\"serif\">on purpose.</em>"
    )
    default_cta_headline = (
        "A loving, home environment families would be proud to have their own "
        "mom and dad live in."
    )
    footer_blurb = (
        f"{name} is a small senior living community designed around the people "
        "who actually live here — with the help they need, the dignity they deserve."
    )

    # Optional welcome badge: if hero stats include a "residents" stat, mirror it
    # here. Strip inline HTML so the badge label renders as plain text.
    welcome_badge = None
    for s in copy.hero_stats:
        if "resident" in s.label.lower():
            clean = re.sub(r"<[^>]+>", " ", s.label).strip()
            clean = re.sub(r"\s+", " ", clean)
            welcome_badge = {"value": s.value, "label": clean}
            break

    # Welcome image: prefer the first gallery photo if any; else default Unsplash.
    welcome_image_path = (
        rendered_copy.photo_gallery_paths[0]
        if rendered_copy.photo_gallery_paths
        else _DEFAULT_WELCOME_PHOTO
    )

    return {
        "audit": audit,
        "scrape": scrape,
        "copy": rendered_copy,
        "icons": ICONS,
        "favicon_svg": FAVICON_SVG,
        "brand_first": brand_first,
        "brand_second": brand_second,
        "location_label": location_label,
        "eyebrow_text": eyebrow_text,
        "welcome_headline": welcome_headline,
        "welcome_image_path": welcome_image_path,
        "welcome_badge": welcome_badge,
        "care_headline": care_headline,
        "care_intro": care_intro,
        "care_card_tags": CARE_CARD_TAGS,
        "care_card_images": care_card_images,
        "way_headline": way_headline,
        "way_intro": way_intro,
        "amenities_headline": amenities_headline,
        "amenities_intro": amenities_intro,
        "gallery_headline": gallery_headline,
        "gallery_intro": gallery_intro,
        "pricing_headline": pricing_headline,
        "pricing_default_intro": pricing_default_intro,
        "visit_headline": visit_headline,
        "visit_intro": visit_intro,
        "default_cta_headline": default_cta_headline,
        "footer_blurb": footer_blurb,
        "placeholder_gallery_captions": DEFAULT_PLACEHOLDER_GALLERY_CAPTIONS[:6],
        "year": datetime.now().year,
    }


def _copy_referenced_photos(
    *,
    scrape: ScrapeResult,
    copy: CopyResult,
    out_dir: Path,
) -> list[str]:
    """Copy only the photos referenced by the CopyResult into out_dir.
    Returns a list of repo-relative paths that are now present on disk
    (so the template can decide whether to render <img> or placeholder).
    Skips items that look like absolute URLs (http/https) — those go straight
    to the template as remote refs.
    """
    referenced: list[str] = []
    if copy.hero_image_path and not copy.hero_image_path.startswith(("http://", "https://")):
        referenced.append(copy.hero_image_path)
    referenced.extend(
        p for p in (copy.photo_gallery_paths or [])
        if not p.startswith(("http://", "https://"))
    )

    present: list[str] = []
    for repo_rel in referenced:
        src = REPO_ROOT / repo_rel
        if not src.exists():
            print(f"  ! photo missing on disk, skipping: {repo_rel}")
            continue
        dst = out_dir / src.name
        shutil.copy2(src, dst)
        present.append(repo_rel)
    return present


def _upsert_manifest(*, entry: ManifestEntry) -> Manifest:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if MANIFEST_JSON.exists():
        manifest = Manifest.model_validate_json(MANIFEST_JSON.read_text())
    else:
        manifest = Manifest(generated_at=datetime.now(timezone.utc), communities=[])
    others = [c for c in manifest.communities if c.slug != entry.slug]
    manifest = Manifest(
        generated_at=datetime.now(timezone.utc),
        communities=sorted([*others, entry], key=lambda e: e.slug),
    )
    MANIFEST_JSON.write_text(manifest.model_dump_json(indent=2))
    return manifest


def generate_one(slug: str) -> Path:
    audit_path = audit_json_path(slug)
    scrape_path = scrape_json_path(slug)
    copy_path = COPY_DIR / f"{slug}.json"

    for p in (audit_path, scrape_path, copy_path):
        if not p.exists():
            sys.exit(f"missing required input: {p.relative_to(REPO_ROOT)}")

    audit = AuditResult.model_validate_json(audit_path.read_text())
    scrape = ScrapeResult.model_validate_json(scrape_path.read_text())
    copy = CopyResult.model_validate_json(copy_path.read_text())

    if copy.slug != slug or scrape.slug != slug or audit.slug != slug:
        sys.exit(f"slug mismatch — audit:{audit.slug} scrape:{scrape.slug} copy:{copy.slug}")

    site_dir = public_site_dir(slug)
    site_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(TEMPLATE_DIR / "styles.css", site_dir / "styles.css")
    photo_files_present = _copy_referenced_photos(scrape=scrape, copy=copy, out_dir=site_dir)

    env = Environment(
        loader=FileSystemLoader(str(TEMPLATE_DIR)),
        autoescape=True,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["basename"] = _basename
    env.filters["img_src"] = _img_src
    env.filters["tel_href"] = _tel_href
    env.filters["urlencode"] = lambda s: urlquote(s, safe="")

    ctx = _render_context(
        audit=audit, scrape=scrape, copy=copy,
        photo_files_present=photo_files_present,
    )
    template = env.get_template("index.html.j2")
    html = template.render(**ctx)

    out_html = site_dir / "index.html"
    out_html.write_text(html)

    audit_summary = _summarize_audit(audit)
    photos_used_count = (1 if ctx["copy"].hero_image_path else 0) + len(ctx["copy"].photo_gallery_paths or [])
    deploy_url = f"https://assistedwebsite.netlify.app/{slug}/"

    entry = ManifestEntry(
        monday_item_id=audit.monday_item_id,
        name=scrape.name,
        slug=slug,
        address=scrape.address,
        phone=scrape.phone,
        original_url=scrape.source_url,
        demo_url=deploy_url,
        audit_summary=audit_summary,
        photos_used_count=photos_used_count,
        screenshot_before=audit.screenshot_path if Path(audit.screenshot_path).exists() else None,
        screenshot_after=None,
    )
    _upsert_manifest(entry=entry)
    return out_html


def main() -> None:
    parser = argparse.ArgumentParser(description="Render one community demo site.")
    parser.add_argument("slug", help="community slug (e.g. sunflower-ridge-assisted-living)")
    args = parser.parse_args()

    out_html = generate_one(args.slug)
    print(f"OK — {out_html.relative_to(REPO_ROOT)}")
    print(f"     manifest: {MANIFEST_JSON.relative_to(REPO_ROOT)}")
    print(f"     preview:  python -m http.server 8000 --directory public")
    print(f"               http://localhost:8000/{args.slug}/")


if __name__ == "__main__":
    main()
