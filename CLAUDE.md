# CLAUDE.md

This file is the entry point for every Claude session that opens this repo. Read it first, then jump to the topical docs.

## What this repo is

Two unrelated projects in one tree, deployed as two independent Netlify sites:

1. **Hidden Gem Healing** (`hidden-gem/`) — a multi-page static site for Ezra's wife's clinic, with an in-browser editor that lets her change copy and photos without redeploying. **This is where almost all recent work has happened.** Public, indexable, live at `hiddengemhealingutah.com` via `hidden-gem-editable.netlify.app`.
2. **Senior-living demo pipeline** (`public/`, `PROJECT_PLAN.md`) — designed as an outreach tool that audits, scrapes, and regenerates polished demo websites for senior-living communities. **The pipeline itself is not built** — `src/__init__.py` and `src/lib/__init__.py` exist as stubs but contain no code. Only the compliance scaffolding in `public/` (noindex `_headers`, `robots.txt`, placeholder `index.html`) is real. PROJECT_PLAN.md describes the design for a future build.

If you're picking this repo up cold, you are almost certainly working on Hidden Gem.

## Read these in order (fresh-session checklist)

| When | Read |
|---|---|
| Always, first | This file (`CLAUDE.md`), then `docs/README.md` for the doc index |
| Working on Hidden Gem | `docs/architecture.md` (edit flow), `docs/runbook.md` (deploy/env), `docs/troubleshooting.md` (gotchas) |
| Adding a new page / section / editable element | `docs/content-model.md` |
| Triaging old parked work | `docs/worktree-inventory.md` |
| Writing for / about Elena (the clinic owner) | `docs/editor-handbook.md` |
| Senior-living pipeline questions | `PROJECT_PLAN.md` (design only — code does not exist) |

## Architecture, one paragraph

Elena visits a page on the live site, clicks the small **edit** link in the footer, enters a shared password (`EDITOR_PASSWORD` env var, default `'chloe'` if unset). The browser-side editor (`hidden-gem/js/editor.js`) makes matched DOM nodes `contentEditable`. Saves POST to `/.netlify/functions/content`, which writes overrides to the `site-content` Netlify Blob and fires a GitHub `repository_dispatch` (via `GH_BAKE_PAT`). That triggers `.github/workflows/bake-hidden-gem.yml`, which runs `scripts/bake_hidden_gem_edits.py` to merge blob overrides back into static HTML and commit to `main`. Netlify auto-deploys the result. Edits also bake hourly via cron as a backstop. Full diagram and per-component detail in `docs/architecture.md`.

## Operating principles for the agent

1. **The docs in `docs/` are the source of truth for current behavior.** If `PROJECT_PLAN.md` or this file contradicts them, the topical doc wins and the contradiction is a doc bug — flag it at end-of-turn.
2. **Items in `PROJECT_PLAN.md` marked OPEN require human input.** Pause and ask before guessing.
3. **Compliance is non-negotiable for the senior-living `public/` site.** `noindex` headers + `robots.txt` + per-page meta — never ship without all three. (Not applicable to `hidden-gem/`, which is public-facing.)
4. **Photos are never reused across senior-living communities** if/when the pipeline is built. See `PROJECT_PLAN.md`.
5. **Do not commit secrets.** `.env` is gitignored. `.env.example` is checked in with placeholder keys.

## Deploy model

Both sites share `main` as their deploy branch. They are otherwise independent.

| Netlify site | Base directory | Publish directory | Notes |
|---|---|---|---|
| Hidden Gem (`hidden-gem-editable.netlify.app`) | `hidden-gem` | `.` (relative to base) | Editor + bake loop |
| Senior-living apex | *(repo root)* | `public` | `noindex` site-wide. Placeholder only — pipeline not built. |

**Base + Publish directories live ONLY in the Netlify dashboard** — they are not in any committed file. If the repo structure changes, the dashboard must follow. See `docs/runbook.md` for the full operational reference.

## Lessons (the short version)

The full symptom-cause-fix log is in **`docs/troubleshooting.md`** (22 entries). The most important ones to keep in your head:

- **The hourly bake action will pre-empt your push.** `.github/workflows/bake-hidden-gem.yml` runs on `cron: 0 * * * *`. Do non-trivial HTML edits on a feature branch, or batch into the ~30-min window right after a bake commit lands.
- **Sub-agent worktree isolation doesn't sandbox absolute paths.** Brief sub-agents to use paths relative to their worktree CWD. Keep `.claude/worktrees/` in `.gitignore` before spawning them.
- **Editor/bake EDITABLE_SELECTOR drift silently corrupts content.** The lists in `hidden-gem/js/editor.js` (`EDITABLE_SELECTOR`, `EXT_EDITABLE_SELECTOR`) and `scripts/bake_hidden_gem_edits.py` (`EDITABLE_SELECTORS`, `EXT_EDITABLE_SELECTORS`) must agree exactly. Same for the sanitizer attribute allowlist. Keys are content-hashed (DJB2) since commit `1722b2c`, so drift produces `no match in current DOM; skipping` log lines, not errors.
- **`EDITOR_PASSWORD` defaults to `'chloe'` if unset.** See `hidden-gem/netlify/functions/otp.mjs:21` (`FALLBACK_PASSWORD`). Setting the env var to an empty string is not the same as unsetting it.
- **`hidden-gem/netlify.toml` paths are relative to the Hidden Gem base dir, not the repo root.** Netlify's Base directory = `hidden-gem`, so absolute repo paths break the build silently.
- **Sandbox-level egress firewall blocks `*.netlify.app` from Claude Code on the web.** `.claude/settings.json`'s `allowedDomains` is a separate layer that doesn't override the platform firewall. The hourly bake works because GitHub Actions runners have unrestricted egress. See `docs/troubleshooting.md` for the workaround.
- **"Send an email to X" has three surfaces.** Visible `mailto:` HTML; Netlify Form notification recipient (dashboard only); service-sent email via a Netlify Function + Resend. Conflating them wastes commits.

## Recent session work (May 2026)

Major shipped items, with anchor commits for reference:

- `5ac0cb7` — Editor auth switched from email-OTP via Resend to a single shared password (`EDITOR_PASSWORD`, default `'chloe'`). The hidden-footer "edit" link UX from the OTP work is retained. `hidden-gem/editor_setup.md` describes the older OTP flow and has a deprecation banner at the top.
- `1722b2c` — Editor blob keys switched from positional indexes (`pageKey:N`) to content-addressable DJB2 hashes (`pageKey:h<hash>` / `pageKey:ext:h<hash>`). Drift-resistant: reordering sections doesn't break saved entries.
- `0efb7d1` + `cbcc96c` — The save path now fires a `repository_dispatch` so the bake runs within seconds of a save (not waiting for the hourly cron), with `cancel-in-progress: true` to coalesce rapid saves.
- `c3aa095` — Provider page restructure: home `#paths` is now four cards (Sam pediatric, Sara psychiatric, Sara equine, Abbey primary). Sam and Keira have skeleton "coming soon" pages — they intentionally exist so the nav has live targets; don't expand them substantively without checking.
- `23992e4` — Beta Care-Fit Quiz (8 questions, client-side matching) on home + about pages. Initializer is `initCareQuiz` in `hidden-gem/js/main.js`.
- `b9f683d` — Home-page private-pay positioning section + a placeholder testimonials trio. The placeholder copy is deliberate; replace it with real attributed testimonials once consent is collected.
- `3a6300b` — Footer logo PNG (white horse on dark green + gold-script wordmark).
- `8e80418` — Privacy Practices, No Surprises Act, and custom 404 pages.
- `563e9c3` — Booking form now uses native Netlify Forms with inline AJAX success (no `thanks.html`, no Resend hook). Form notification recipient is set in the Netlify dashboard (currently `etorres@care.life` for testing; will move to `elena@hiddengemhealingutah.com`).
- `584f5a2` — Critical fix: bake-script sanitizer was bypassable for one node category; now the sanitizer is uniform.

A more complete commit log: `git log --oneline -50 main`.

## Where the pipeline scripts actually run

The Claude Code sandbox can't install a browser (blocked CDN, no sudo). Playwright-driven steps would run on the operator's local machine, not in the editing sandbox. The senior-living `audit.py` / `scrape.py` etc. that `PROJECT_PLAN.md` §5 describes have not been built — see `docs/architecture.md` §7 for the current state. If a future session implements them, the operator-local setup is:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
python -m playwright install chromium
cp .env.example .env
```

## First action when picking up this repo

1. Read this file (you just did).
2. Open `docs/README.md` for the doc index.
3. If you're on a fresh checkout and the task touches Hidden Gem, skim `docs/architecture.md`. If it touches deploy/ops, skim `docs/runbook.md`. If you're about to add new editable content, skim `docs/content-model.md`.
4. If you're picking up the senior-living thread, read `PROJECT_PLAN.md` end-to-end and treat its task list in **Appendix A** as authoritative.
