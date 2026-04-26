# PROJECT PLAN V2 — Benchmark-First Template System

> **Working name:** silverlist (placeholder)
> **Date:** April 25, 2026
> **Primary goal now:** Build one benchmark-quality assisted living template inspired by `meridiansenior.com`, but with improved UI/UX.
> **Execution model:** agent-based workflow, with Sonnet as the coding model.

---

## 1. What We Are Doing

We are not starting with multi-vertical expansion.

We are doing this in order:

1. Use `meridiansenior.com` as the benchmark reference.
2. Build a better, modernized benchmark template (same category fit, better UX/UI, not a clone).
3. Validate the benchmark template visually and functionally.
4. Create additional template "flavors" from this benchmark foundation.
5. Use those flavors to generate sites for other assisted living communities.

This is a benchmark-first design system project, then a generation pipeline rollout.

---

## 2. Core Product Decision

The first artifact is a **single high-quality base template** for assisted living communities.

That base template must be:
- Clearly inspired by proven assisted-living website structure
- Visibly distinct in style and implementation
- Better in mobile UX, readability, accessibility, and conversion flow
- Reusable by agents for fast per-community generation

---

## 3. Benchmark Rules (Meridian-Inspired, Not Cloned)

### Allowed
- Reuse information architecture patterns (section order, hierarchy, CTA rhythm)
- Reuse UX principles (clarity, trust flow, mobile-first interaction)
- Reuse content intent (what users need to know, and when)

### Not allowed
- Copying exact wording
- Copying visual identity/brand markers
- Reproducing unique custom components near-identically
- Cloning page HTML/CSS structure directly

Rule: **Translate quality patterns, do not replicate brand expression.**

---

## 4. Phase 1 Deliverable (Must Ship First)

Build `template_benchmark_v1` with stronger UI/UX than common assisted-living sites.

### Required sections
1. Hero (community name, location, primary CTA)
2. Care levels offered
3. About/community voice
4. Amenities & lifestyle
5. Photo gallery
6. FAQ
7. Tour/contact form
8. Footer with trust + disclosure

### Required UX upgrades
- Mobile-first responsive behavior
- Strong visual hierarchy and whitespace system
- Accessible color contrast and focus states
- Sticky mobile CTA (`Call` + `Schedule Tour`)
- Short high-conversion form
- Fast-loading media behavior (optimized and lazy-loaded where appropriate)

---

## 5. UI/UX Quality Bar (Better Than Benchmark)

`template_benchmark_v1` must beat baseline quality on:

- **Readability:** 16px minimum body text on mobile, clear heading scale
- **Scanability:** short paragraphs, clear section headers, card-based chunks
- **Conversion clarity:** visible primary CTA above fold + repeated CTA strategy
- **Trust communication:** authentic visual treatment, contact transparency
- **Accessibility:** keyboard focus visibility, AA contrast target
- **Performance feel:** no heavy blocking scripts, optimized images

---

## 6. Agent-Based Build Workflow

Use specialized agents in sequence:

### Agent A — Benchmark Analyzer
- Input: `meridiansenior.com`
- Output: structure map, conversion map, UX strengths, reusable layout patterns

### Agent B — UX/UI Enhancer
- Input: Agent A output
- Output: improved design system spec (tokens, typography, spacing, components, states)

### Agent C — Template Builder
- Input: enhanced spec
- Output: implemented static template files (`index.html.j2`, `styles.css`, component partials if needed)

### Agent D — QA Reviewer
- Input: rendered benchmark template
- Output: issue list for mobile, accessibility, conversion friction, visual polish gaps

### Agent E — Flavor Generator
- Input: approved benchmark template
- Output: additional flavors (e.g., warm_traditional, modern_active, hospitality_soft) sharing same structure but different visual systems

---

## 7. Template Flavor Strategy (After Benchmark Approval)

Flavors are visual/voice variants built on a shared layout contract.

All flavors must keep:
- same section schema,
- same data bindings,
- same compliance requirements.

Flavors can vary:
- color palette,
- type scale and personality,
- card and button styling,
- imagery treatment and icon style,
- tone calibration (while staying compliant).

---

## 8. Pipeline Integration (After Template Work)

Once benchmark + flavors are ready:

1. Audit assisted living community sites.
2. Scrape content and photos.
3. Generate per-community site using selected flavor.
4. Deploy to Netlify demo URL.
5. Write `out/manifest.json`.

No deployment rollout before benchmark template approval.

---

## 9. Compliance Requirements (Non-Negotiable)

Every generated demo site must include:
- `<meta name="robots" content="noindex,nofollow">`
- `robots.txt` disallow all
- `_headers` with `X-Robots-Tag: noindex`
- transparent demo disclosure in footer

Photos must follow project guardrails (scraped or approved fallback flow).

---

## 10. Model and Execution Policy

### Coding model
- Use **Claude Sonnet** for implementation/coding actions.

### Agent orchestration
- Use agents for decomposition and QA as defined above.
- Keep outputs structured so each downstream agent consumes clear artifacts.

---

## 11. Definition of Done (Current Revision)

This plan is complete when:

1. `template_benchmark_v1` exists and is approved as better UX/UI than benchmark baseline.
2. At least 2 additional flavors are created on the same template contract.
3. One community test generation works per flavor.
4. Compliance checks pass on all generated outputs.
5. The system is ready to scale to additional assisted living communities.

---

## 12. Immediate Next Actions

1. Run Agent A benchmark analysis for `meridiansenior.com`.
2. Produce the enhanced UI token + component specification.
3. Implement `template_benchmark_v1`.
4. Run QA pass and fix findings.
5. Create first two flavors from the approved benchmark template.

# PROJECT PLAN V2 — Assisted Living + Local Services Demo Pipeline

> **Working name:** silverlist (placeholder)
> **Date:** April 25, 2026
> **Execution mode:** AI-assisted build with Claude Sonnet for coding tasks
> **Supersedes:** This plan extends the original `PROJECT_PLAN.md` with a second vertical and a benchmark-driven template strategy.

---

## 1. Mission

Build a repeatable pipeline that identifies weak business websites, generates polished replacement demo sites, deploys them to hidden Netlify URLs, and outputs outreach-ready summaries.

Phase 1 focuses on:
- **Primary vertical:** assisted living communities (highest confidence and fastest path)
- **Secondary vertical:** local service businesses (starting with painting)

---

## 2. Why this version

The original plan validated senior living. This version adds:
- A benchmark-inspired template process (reference quality without cloning)
- A dual-vertical structure so we can expand beyond assisted living
- A stricter scoring model to classify sites as great vs bad consistently
- A practical model workflow: Sonnet for implementation and production code generation

---

## 3. Core architecture

```
Input leads (CSV)
   -> Agent 1 Audit
   -> Agent 2 Scrape
   -> Agent 3 Generate (template + vertical prompts)
   -> Agent 4 Deploy (Netlify, hidden/noindex)
   -> out/manifest.json
```

### Shared outputs per lead
- `audit`: failures, score, evidence
- `scrape`: extracted facts, photos, content blocks
- `site_bundle`: static HTML/CSS/assets
- `deploy_url`: demo URL
- `manifest_entry`: outreach summary

---

## 4. Vertical lanes

### Lane A: Assisted Living (primary)
- Benchmark reference quality: `meridiansenior.com` (structure and UX patterns only)
- Compliance-heavy copy constraints (no medical claims, no invented staff/pricing)
- Sections: hero, care levels, about, amenities, gallery, FAQ, tour/contact form

### Lane B: Local Services (secondary, start with painting)
- Conversion-heavy structure: service area, before/after gallery, trust badges, quote form
- Simple CTA path: call now + request estimate
- Categories can later expand to roofing, HVAC, plumbing, landscaping

---

## 5. Scoring model (great vs bad)

Use a two-step rubric:

### Step 1: Critical fails (auto-bad)
- Not secure (no HTTPS, cert/security warning)
- Site does not reliably load
- Not an owned identity site (directory/social-only listing)
- Core contact path broken (primary form/call path unusable)

### Step 2: Quality score (0-20)
Score each 0-2:
- Mobile UX
- Above-the-fold clarity
- Conversion path quality
- Service/care clarity
- Contact transparency
- Trust signals
- Content freshness
- Performance
- Technical quality
- Brand/design quality

Rating bands:
- `17-20` Great
- `13-16` Good
- `9-12` Weak
- `0-8` Bad

---

## 6. Template strategy (benchmark-inspired, not cloned)

Use the benchmark for information architecture and usability patterns only.

Do:
- Reuse proven section flow
- Reuse UX principles (spacing, CTA cadence, readability)
- Build a distinct token-based design system

Do not:
- Copy source text verbatim
- Copy unique branding, imagery style, or bespoke components
- Produce a near-identical look-and-feel

---

## 7. UI system baseline (Template V1)

### Design goals
- Warm, credible, easy to scan on mobile
- Fast-loading static pages
- Strong CTA and trust signals

### Tokens
- Neutral background + white surfaces
- One primary brand accent, one secondary accent
- 8px spacing system
- 16px minimum mobile body text
- Accessible contrast (WCAG AA target)

### Required sections (assisted living)
1. Hero with primary CTA
2. Care levels
3. About/community voice
4. Amenities/lifestyle
5. Photo gallery
6. FAQ
7. Lead form
8. Footer + disclosure

---

## 8. Netlify deployment topology

Recommended for speed:
- One Netlify site per community/business demo during MVP
- Optional main marketing site on a separate Netlify project
- Demo URL pattern:
  - MVP fast path: `{slug}.netlify.app`
  - Branded phase: `{slug}.demo.<your-domain>`

All demos must include:
- `<meta name="robots" content="noindex,nofollow">`
- `robots.txt` disallow all
- `_headers` with `X-Robots-Tag: noindex`

---

## 9. Data freshness strategy

Because lead URLs go stale, maintain:
- `website_original`
- `website_verified`
- `website_status` (`verified`, `redirected`, `stale`, `unknown`)
- `verified_source` (maps/operator site/manual)
- `verified_at` timestamp

Preferred verification order:
1. Google Business Profile
2. Operator location page
3. Directory sources (fallback only)

---

## 10. Execution with Sonnet

### Coding model policy
- Use **Claude Sonnet** for implementation and file edits.
- Use other models only for optional research or brainstorming in separate chats.
- Before any coding action, confirm the active build chat is Sonnet.

### API model for generation pipeline
- Use Anthropic Sonnet model for audit extraction and copy generation.
- Keep prompts and schemas strict to reduce hallucinated details.

---

## 11. Deliverables for this phase

1. Template V1 built and visually validated on mobile + desktop.
2. Scoring worksheet and automated critical-fail pass.
3. Updated lead dataset with verified URLs.
4. End-to-end pipeline run on:
   - 10 assisted living communities
   - 5 painting businesses (pilot)
5. `out/manifest.json` populated with demo URLs + audit summaries.

---

## 12. Definition of done

This phase is complete when:
- At least 80% of selected leads deploy successfully.
- Every deployed demo has required noindex safeguards.
- At least 3 demos per vertical are outreach-ready after manual review.
- Great vs bad scoring is consistent across reviewers on a shared rubric.

---

## 13. Immediate next actions

1. Finalize Template V1 component scaffold and CSS token system.
2. Implement/lock audit rubric code for critical-fail + 20-point scoring.
3. Add URL verification step before audit execution.
4. Run pilot batch and inspect outputs manually.
5. Select first outreach targets from highest-confidence demos.

