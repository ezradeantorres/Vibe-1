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

## Lessons from past sessions (read before working on Hidden Gem)

These are gotchas that have cost real time. They're not theoretical.

### Sub-agent worktree isolation has gaps

`isolation: "worktree"` on the `Agent` tool creates a real isolated git worktree, but it does **not** sandbox file writes. If a prompt or tool call references absolute paths like `/home/user/Vibe-1/hidden-gem/...`, the sub-agent's `Edit`/`Write` can land in the **main tree** instead of (or in addition to) its worktree. Result: agents bleed into main, race with one another, and `git status` between calls becomes unreliable while sub-agents are running.

- Brief sub-agents to use **paths relative to their worktree CWD**, not the repo's absolute path.
- Always have `.claude/worktrees/` in `.gitignore` **before** spawning sub-agents. A naive `git add -A` afterwards captures each worktree as a mode-160000 gitlink; Netlify then treats them as broken submodules and the build fails.
- Don't trust working-tree state between consecutive tool calls while sub-agents are running. `git diff` at T1 and `git status` at T2 may legitimately disagree.

### Parallel `Edit`s to the same file collide

Batching multiple `Edit` calls to the same file in one assistant message: only the first applies; the rest error with "file modified since read". Either sequence the edits across messages, or use a single `Write` with the full new contents.

### The hourly bake action will pre-empt your push

`.github/workflows/bake-hidden-gem.yml` runs on `cron: 0 * * * *`. If it fires while you've staged uncommitted HTML changes, it commits BeautifulSoup-reformatted HTML (every attribute requoted, every tag self-closed, whitespace shuffled). A subsequent `git pull --rebase` produces unsalvageable conflicts on every page. Two safe patterns:

- Do non-trivial HTML edits on a feature branch and merge deliberately into `main`.
- Or batch changes into the ~30-minute window right after a bake commit lands.

### Netlify dashboard config that lives outside the repo

When the repo structure changes (e.g. PR #3's restructure into `hidden-gem/`), the Netlify dashboard's **Base directory** and **Publish directory** must follow. If they don't, the build still "succeeds" (no `[build]` block to fail) but publishes the wrong path — site 404s everywhere and the deploy log gives no clue. Always verify Base + Publish in the dashboard when paths move.

Other settings only the dashboard owns:
- **Forms → notifications → recipient** for the `appointment` booking form. Currently `etorres@care.life` (testing); switch to `elena@hiddengemhealingutah.com` once submissions are confirmed flowing.
- **Env vars** for Netlify Functions — including `RESEND_API_KEY` for the editor OTP function (and ideally a verified `hiddengemhealingutah.com` domain in Resend so OTPs don't ship from `onboarding@resend.dev`).

### Sandbox network reality

Claude Code on the web has a platform-level egress firewall that returns `x-deny-reason: host_not_allowed` for any domain outside the environment's network policy. Two important consequences:

- `.claude/settings.json`'s `sandbox.network.allowedDomains` is a separate layer that governs what Claude inside the session is permitted to call. It does **not** override the platform firewall. The entry for `hidden-gem-editable.netlify.app` in this repo is real, but the platform still blocks the host.
- To actually reach `*.netlify.app` (run `bake_hidden_gem_edits.py`, curl functions, WebFetch the live HTML), the **environment's network policy** must be changed at environment-create time in the Claude Code web app, and a new session started from that environment. The current session can't bypass it. The hourly GitHub Action runs on GitHub-hosted runners, which have unrestricted egress, which is why the bake works there.

### "Send an email to X" always has multiple surfaces

When the ask is "make Y email Z@…", clarify which surface:

1. **Visible** `mailto:` link in HTML (changeable in code)
2. **Netlify Form notification recipient** (Netlify dashboard only)
3. **Service-sent email** like OTP / receipts (Netlify Function + Resend / SendGrid env var)
4. A combination

Conflating these wastes commits. For the Hidden Gem site today: visible mailto links are `info@hiddengemhealingutah.com`; Netlify Form submissions notify `etorres@care.life` (test) and will move to `elena@…` for production; OTP delivery is gated to the whitelist `[etorres@care.life, elena@hiddengemhealingutah.com]` via Resend.

### Editor / Blobs / bake invariants

- `hidden-gem/js/editor.js` `EDITABLE_SELECTOR` + `EXT_EDITABLE_SELECTOR` must mirror `scripts/bake_hidden_gem_edits.py` `EDITABLE_SELECTORS` + `EXT_EDITABLE_SELECTORS` exactly — indexing is positional, so any drift silently corrupts which DOM node a key maps to. Keep the two in sync or break both intentionally.
- `:ext:` namespace was historically skipped by the bake. It's now (or should be) handled symmetrically — verify before relying on it.
- `el.innerHTML = data[key]` in `editor.js:124` and `BeautifulSoup.append` in `bake_hidden_gem_edits.py:163` both treat stored content as raw HTML. Whoever can POST to `content.mjs` can therefore inject persistent XSS that survives the bake. The OTP whitelist is the trust boundary; don't widen it without also sanitizing.

### "Locked deploy" framing is a common misdiagnosis

A previous session believed the live Hidden Gem site was stuck on an April deploy because Netlify's "Lock to current deploy" was on. It wasn't — the real cause was the missing Base directory after the restructure. Before assuming the deploy is locked, look at the dashboard's actual "Auto publishing is on/off" state and the most recent deploy's status.
