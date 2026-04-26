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

The Claude Code sandbox where this repo is edited cannot install a browser (blocked CDN, no sudo) and is locked to a host denylist for outbound traffic. All Playwright-driven steps (`src/audit.py`, `src/scrape.py`) run on the **operator's local machine**, not in the editing sandbox. See `RUNBOOK.md` for the exact commands.

After running an agent, the operator force-adds the produced artifacts under `work/` (gitignored by default — `git add -f` per artifact when an in-session review is needed) and pushes. The in-session agent reads the artifacts via the repo and produces the next-stage JSON.

## Deploy model: Netlify <-> GitHub auto-deploy

This repo is connected to one Netlify site. Build settings: production branch `main`, publish directory `public/`, no build command (the generated sites are plain static HTML). Pushing to `main` auto-deploys.

- Each community demo lives at `public/<slug>/index.html` and is reachable at `<netlify-site>.netlify.app/<slug>/`.
- Site-wide compliance (`PROJECT_PLAN.md` §13) is enforced by:
  - `public/_headers` setting `X-Robots-Tag: noindex,nofollow` for every path.
  - `public/robots.txt` disallowing all crawlers.
  - Each generated `index.html` also carrying its own `<meta name="robots" content="noindex,nofollow">` as belt-and-suspenders.
- The apex `<netlify-site>.netlify.app` serves a generic placeholder (`public/index.html`) — no demo list, no branding, no public surface.
- Workflow: develop on `silverlist/phase-1-mvp`, merge a community's `public/<slug>/` directory into `main` once Ezra approves it on his phone, push, Netlify deploys within ~30s, send the URL to the operator.

## First action when picking up this repo

If this is a fresh checkout: read `PROJECT_PLAN.md` end-to-end, then execute the task list in **Appendix A** of that document, in order, applying the Phase 1 deviation above.

## Current state — for the next operator

`RUNBOOK.md` §"Current state" carries the dated snapshot of where the pipeline is, what's been decided, what's blocked, and the exact commands the next operator (Ezra or Ted) should run. Read it before touching anything — it overrides any stale assumptions in this file or `PROJECT_PLAN.md`.
