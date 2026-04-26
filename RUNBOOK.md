# RUNBOOK — Phase 1 MVP

Operator-facing commands for executing the pipeline. The Claude Code editing
sandbox can't install a browser or reach external sites, so the Playwright
stages (`audit`, `scrape`) must run on a real workstation. After running each
stage, commit the produced artifacts so the in-session agent can review them.

## Current state (2026-04-26) — read this first

**Operators on deck:** Ezra + Ted. Either of you can run the steps below.
**Active branch:** `silverlist/phase-1-mvp`. All work commits here. `main`
is the deploy branch — only merge a community's `public/<slug>/` into `main`
once Ezra approves it on his phone.

**Decisions locked in this session:**

- **Community #1:** Sunflower Ridge Assisted Living
  (`https://sunflowerridgeassistedliving.com/`). Already in
  `data/selected_for_mvp.csv` as `manual-0001`.
- **Visual reference for the template:** Meridian Senior Living's Crescent
  page (Sandy, UT) — URL Ezra shared in chat. Goal stated by Ezra: *"their
  community colors, photos, info, and more modern buttons and style."* Use
  Meridian's layout/IA as the structural reference; pull colors + photos +
  copy from each individual community.
- **Phase 1 LLM mode:** manual, in-session (per `CLAUDE.md`). No
  `ANTHROPIC_API_KEY` needed. `src/lib/llm.py` is intentionally not built.
- **Deploy target:** `https://assistedwebsite.netlify.app/<slug>/` via
  Netlify ↔ GitHub auto-deploy on push to `main`.

**What's already built on this branch:**

- `src/audit.py` — deterministic checks + screenshot per row
- `src/scrape.py` — Playwright render + photo download
- `src/lib/paths.py`, `src/lib/schema.py` — pipeline contracts
- `public/index.html` placeholder, `public/_headers`, `public/robots.txt`
- `data/selected_for_mvp.csv` seeded with Sunflower Ridge

**Not yet built:** `src/generate.py`, `src/deploy.py`,
`src/templates/warm_traditional/`, `src/prompts/`. These come **after** the
audit/scrape artifacts for Sunflower Ridge are in the repo and the in-session
agent has eyeballed the Meridian reference.

**Three blocking items waiting on the operator (run in any order):**

1. **Verify Netlify auto-deploy works.** Confirm
   `https://assistedwebsite.netlify.app/` returns the placeholder
   `public/index.html` and that `curl -I` shows
   `X-Robots-Tag: noindex, nofollow`. If not, fix the Netlify ↔ GitHub
   connection before going further.
2. **Drop the Meridian/Crescent reference screenshot** at
   `references/meridian-crescent-fullpage.png` (full-page capture, see
   "Visual reference screenshots" below). Force-add and push.
3. **Run audit + scrape on Sunflower Ridge** on a real workstation:

   ```bash
   git checkout silverlist/phase-1-mvp && git pull
   python -m src.audit  data/selected_for_mvp.csv
   python -m src.scrape data/selected_for_mvp.csv
   git add -f work/audits/sunflower-ridge-assisted-living.json \
             work/audits/sunflower-ridge-assisted-living.png \
             work/scrapes/sunflower-ridge-assisted-living/rendered.html \
             work/scrapes/sunflower-ridge-assisted-living/scrape.json \
             work/scrapes/sunflower-ridge-assisted-living/photos/
   git commit -m "Add work artifacts for sunflower-ridge-assisted-living"
   git push
   ```

Once those three land, the in-session agent will: fill
`primary_cta_above_fold` + `is_bad` on the audit, fill the extracted fields
on the scrape JSON, build out the template under
`src/templates/warm_traditional/` against the Meridian reference, write
`src/generate.py`, and produce `public/sunflower-ridge-assisted-living/` for
review.

**Note on branch naming:** any task description that mentions
`claude/create-epoxy-flooring-site-Tuqm1` is an auto-generated branch name
from a previous unrelated session and should be ignored. Develop on
`silverlist/phase-1-mvp`.

## One-time setup

```bash
git checkout silverlist/phase-1-mvp && git pull
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
python -m playwright install chromium
```

No `.env` values are required for Phase 1: deploys go through the
Netlify ↔ GitHub auto-deploy on push to `main`, and the LLM steps are driven
manually inside Claude Code (per `CLAUDE.md`).

## Running the auditor

```bash
python -m src.audit data/selected_for_mvp.csv
```

Writes one `work/audits/<slug>.json` plus `work/audits/<slug>.png` per row.
Five rubric checks are filled in deterministically; `primary_cta_above_fold`
and `is_bad` stay `null` — the in-session agent will fill them in after
eyeballing the screenshot.

To audit a subset:

```bash
python -m src.audit data/utah_communities.csv --only legacy-house-of-ogden,capitol-hill-senior-living
python -m src.audit data/utah_communities.csv --limit 5
```

## Running the scraper

```bash
python -m src.scrape data/selected_for_mvp.csv
```

Writes one `work/scrapes/<slug>/rendered.html`, `work/scrapes/<slug>/photos/`,
and a partial `work/scrapes/<slug>/scrape.json` per row. Photos are
filtered to ≥800×600, logos/icons dropped, capped at 12. The in-session
agent reads `rendered.html` and fills in services / amenities / about /
staff / hours / `existing_copy_blocks` directly into the JSON.

## Committing artifacts so Claude can review

`work/` is gitignored by default to keep the tree light. Force-add the
specific artifacts you want reviewed:

```bash
git add -f work/audits/<slug>.json work/audits/<slug>.png \
          work/scrapes/<slug>/rendered.html \
          work/scrapes/<slug>/scrape.json \
          work/scrapes/<slug>/photos/
git commit -m "Add work artifacts for <slug>"
git push
```

## Visual reference screenshots

Drop reference screenshots (Meridian/Crescent etc.) under `references/` in
the repo so the in-session agent can read them when designing the template.

```bash
mkdir -p references
# save full-page screenshot from your browser:
#   - DevTools > ⋮ > "Capture full size screenshot" (Chrome)
#   - Develop > "Take screenshot of selected element" (Safari, on <body>)
mv ~/Downloads/meridian-crescent-fullpage.png references/
git add references/meridian-crescent-fullpage.png
git commit -m "Add Meridian/Crescent visual reference"
git push
```

## Generator + deploy (Phase 1)

Generator is Jinja-only — no LLM call inside the script. The in-session
agent produces a `CopyResult` JSON that's fed to `src/generate.py`, which
renders against `src/templates/warm_traditional/` and writes the bundle to
`work/sites/<slug>/`. The agent then copies the bundle into `public/<slug>/`
on `main`, pushes, and Netlify auto-deploys to
`https://assistedwebsite.netlify.app/<slug>/`.

Concrete commands once `src/generate.py` is wired up will land here.
