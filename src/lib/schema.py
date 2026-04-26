"""Pydantic schemas — the contract between the four pipeline stages.

These models define the JSON shape passed between Auditor, Scraper,
Generator, and the final manifest. They're also the contract followed
by the in-session Claude Code agent when it produces JSON manually
(e.g., the CTA-above-fold field of AuditResult, the full ScrapeResult,
or the CopyResult). Fields and shapes follow PROJECT_PLAN.md §7-§12.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class AuditScores(_Strict):
    """The 6-criterion rubric from PROJECT_PLAN.md §7.

    Boolean criteria are True when the site PASSES.
    `primary_cta_above_fold` is None until the in-session agent eyeballs
    the screenshot — see Phase 1 LLM-execution-mode in CLAUDE.md.
    `lighthouse_perf` is the integer mobile performance score (0-100),
    or None if Lighthouse was unavailable / timed out.
    """

    site_loads: bool
    mobile_responsive: bool
    owns_identity: bool
    primary_cta_above_fold: Optional[bool] = None
    recent_update_signal: bool
    lighthouse_perf: Optional[int] = Field(default=None, ge=0, le=100)


class AuditResult(_Strict):
    """One row of the auditor output, one file under work/audits/{slug}.json.

    `is_bad` is None when scores.primary_cta_above_fold is still None
    (i.e., classification is incomplete pending manual vision review).
    """

    monday_item_id: str
    name: str
    slug: str
    url: str
    fetched_at: datetime
    status_code: Optional[int] = None
    is_bad: Optional[bool] = None
    critical_failures: list[str] = Field(default_factory=list)
    standard_failures: list[str] = Field(default_factory=list)
    scores: AuditScores
    screenshot_path: str
    notes: str = ""


class ScrapedService(_Strict):
    name: str
    description: str = ""


class ScrapedStaffMember(_Strict):
    name: str
    title: str = ""


class ScrapedPhoto(_Strict):
    """One photo successfully downloaded from the source site.

    `downloaded_path` is repo-relative (e.g. "work/scrapes/<slug>/photos/0.jpg").
    """

    src_url: str
    alt: str = ""
    downloaded_path: str
    width: int
    height: int


class ScrapeResult(_Strict):
    """The structured extraction the in-session agent produces from the
    rendered HTML. PROJECT_PLAN.md §8.

    Phone is normalized to +1-XXX-XXX-XXXX. Photos cap at 12. Services
    are limited to {Independent Living, Assisted Living, Memory Care,
    Respite Care, Skilled Nursing} — extracted only if present, never
    invented.
    """

    monday_item_id: str
    slug: str
    name: str
    tagline: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    services: list[ScrapedService] = Field(default_factory=list)
    amenities: list[str] = Field(default_factory=list)
    about_text: Optional[str] = None
    staff: list[ScrapedStaffMember] = Field(default_factory=list)
    hours: Optional[str] = None
    photos: list[ScrapedPhoto] = Field(default_factory=list, max_length=12)
    existing_copy_blocks: list[str] = Field(default_factory=list)
    source_url: str
    fetched_at: datetime


class CopyService(_Strict):
    """Generator output for one care-level service block."""

    key: str  # one of: independent_living, assisted_living, memory_care, respite_care, skilled_nursing
    headline: str
    body: str


class CopyFAQ(_Strict):
    question: str
    answer: str


class CopyResult(_Strict):
    """The structured copy the in-session agent produces, fed to the
    Jinja template by src/generate.py. PROJECT_PLAN.md §9-§10.

    Constraints (enforced by post-render lint, not the schema):
    - No medical claims, no pricing, no superlatives.
    - No invented staff names, certifications, services.
    - Copy paraphrases scrape.existing_copy_blocks; doesn't copy verbatim.
    """

    slug: str
    seo_title: str = Field(max_length=60)
    seo_description: str = Field(max_length=160)
    hero_headline: str
    hero_subhead: str
    hero_image_path: str  # repo-relative, in the deployed bundle
    about_paragraph: str
    services: list[CopyService] = Field(default_factory=list, max_length=5)
    faqs: list[CopyFAQ] = Field(default_factory=list, min_length=4, max_length=8)
    photo_gallery_paths: list[str] = Field(min_length=3, max_length=8)
    primary_cta_text: str = "Schedule a Tour"


class ManifestEntry(_Strict):
    """One row of out/manifest.json. PROJECT_PLAN.md §12."""

    monday_item_id: str
    name: str
    slug: str
    address: Optional[str] = None
    phone: Optional[str] = None
    original_url: str
    demo_url: str
    audit_summary: str
    photos_used_count: int
    screenshot_before: Optional[str] = None
    screenshot_after: Optional[str] = None


class Manifest(_Strict):
    generated_at: datetime
    communities: list[ManifestEntry] = Field(default_factory=list)
