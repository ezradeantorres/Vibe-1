# CLAUDE.md

This repo's single source of truth is **`PROJECT_PLAN.md`**. Read it in full before doing anything else.

Quick orientation:

- **What this is:** a pipeline that audits, scrapes, regenerates, and deploys polished demo websites for senior living communities, used as the hook for cold outreach. The full motivation, architecture, and scope boundaries are in `PROJECT_PLAN.md`.
- **Input data:** `data/utah_communities.csv` (91 rows). Columns: `monday_item_id, name, phone, website, address, management_group, call_status`.
- **Output:** `out/manifest.json` — per-community demo URL + audit notes, used for human-driven email outreach.
- **Phase 1 deadline:** end of the current work session (~6 hours from kickoff). Phase 1 success criteria are in §15 of `PROJECT_PLAN.md`.

## Operating principles for the agent

1. **Treat `PROJECT_PLAN.md` as ground truth.** When it conflicts with general best practice, follow the plan and flag the conflict at the end of your turn.
2. **Items marked OPEN require human input.** Pause and ask before guessing.
3. **Quality bar over coverage.** A working pipeline on 10 communities beats a half-broken pipeline on 91. Don't skip the manual eyeball check on the template (§9).
4. **Compliance is non-negotiable.** Every generated site must have `noindex` + `robots.txt` + `X-Robots-Tag` (§13). Don't ship a site that's missing any of these.
5. **Photos are scraped, not generated, and never reused across communities.** If usable photos aren't available, fall back to one curated stock photo and note it in the manifest.
6. **Do not commit secrets.** `.env` is gitignored. `.env.example` is checked in with placeholder keys.

## Phase 1 deviation from `PROJECT_PLAN.md`: LLM execution mode

`PROJECT_PLAN.md` §5 specifies the Anthropic API (`claude-sonnet-4-5`) for the audit's CTA-above-fold vision check, the scrape extraction pass, and the site copy generation. **For Phase 1, those LLM steps are driven manually inside a Claude Code session, not via the Anthropic SDK.** No `ANTHROPIC_API_KEY` is required; `src/lib/llm.py` is intentionally not built.

The pipeline scripts produce intermediate artifacts; the in-session agent reads them and writes the next-stage JSON:

- `src/audit.py` runs deterministic checks (HTTP status, mobile viewport rendering, copyright-year regex, Lighthouse perf) and saves a screenshot per community. The agent reads the screenshot in-session and emits the `cta_above_fold` field of `AuditResult`.
- `src/scrape.py` uses Playwright to fetch HTML and download photos under `work/scrapes/{slug}/`. The agent reads the saved HTML and emits a `ScrapeResult` JSON with extracted fields.
- `src/generate.py` Jinja-renders a `CopyResult` JSON the agent has produced for that community against the frozen template. No LLM call inside the script.
- `src/deploy.py` is fully automated (Netlify CLI + `NETLIFY_AUTH_TOKEN`).

This is a deliberate Phase 1 simplification, not a Phase 2 architecture. The Anthropic-API-driven design in `PROJECT_PLAN.md` §5 remains correct for scaling to the full 91 (and beyond) in Phase 2.

## Where the pipeline scripts actually run

The Claude Code sandbox where this repo is edited cannot install a browser (blocked CDN, no sudo). All Playwright-driven steps (`src/audit.py`, `src/scrape.py`) run on the **operator's local machine**, not in the editing sandbox. The operator sets up once with:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
python -m playwright install chromium
cp .env.example .env  # currently empty — Phase 1 needs no secrets
```

After running an agent, the operator commits the produced artifacts under `work/` (gitignored by default — flip per artifact if a Claude Code review is needed) or pastes the relevant artifact into a Claude Code session for the manual LLM step.

## Deploy model: two Netlify sites, one repo

This repo backs **two separate Netlify sites**, each pointed at a different directory in this repo. They share `main` as the deploy branch but are otherwise independent. **Do not put files for one site into the other's directory.**

| Netlify site | Publish dir | Base dir | What it is |
|---|---|---|---|
| Senior-living demos (apex) | `public/` | *(root)* | The `PROJECT_PLAN.md` pipeline output. `noindex` site-wide. |
| `hidden-gem-editable` | `.` | `hidden-gem/` | Ezra's wife's site (Hidden Gem). Public, indexable. |

### Senior-living site (`public/`)

- Each community demo lives at `public/<slug>/index.html` and is reachable at `<netlify-site>.netlify.app/<slug>/`.
- Site-wide compliance (`PROJECT_PLAN.md` §13) is enforced by:
  - `public/_headers` setting `X-Robots-Tag: noindex,nofollow` for every path.
  - `public/robots.txt` disallowing all crawlers.
  - Each generated `index.html` also carrying its own `<meta name="robots" content="noindex,nofollow">` as belt-and-suspenders.
- The apex `<netlify-site>.netlify.app` serves a generic placeholder (`public/index.html`) — no demo list, no branding, no public surface.

### Hidden Gem site (`hidden-gem/`)

- Static multi-page site (`index.html`, `about.html`, `abbey.html`, `sara-equine.html`, `sara-psychiatric.html`) plus `css/`, `js/`, `images/`, and Netlify Functions in `hidden-gem/netlify/functions/` for an in-browser editor.
- Configured via `hidden-gem/netlify.toml` (read because the Netlify site has **Base directory = `hidden-gem`**). Paths in this file are relative to `hidden-gem/` — never use absolute Mac paths here.
- Public-facing: `hidden-gem/robots.txt` and `hidden-gem/sitemap.xml` allow indexing. Do **not** apply the senior-living `noindex` headers here.
- The senior-living `_headers`/`robots.txt` live inside `public/` and only apply to that site, so they do not affect Hidden Gem.

### Workflow for both

- Develop on `silverlist/phase-1-mvp` (senior-living) or `claude/setup-multi-project-repo-ZYx5a` / a feature branch (Hidden Gem). Merge to `main` once approved. Netlify auto-deploys both sites within ~30s of a push to `main`.
- A push that only touches one site's directory still triggers builds on both Netlify sites, but each site only republishes when its own publish dir actually changes.

## First action when picking up this repo

If this is a fresh checkout: read `PROJECT_PLAN.md` end-to-end, then execute the task list in **Appendix A** of that document, in order, applying the Phase 1 deviation above.
