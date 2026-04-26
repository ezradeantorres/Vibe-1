# RUNBOOK — Phase 1 MVP

Operator-facing commands for executing the pipeline. The Claude Code editing
sandbox can't install a browser or reach external sites, so the Playwright
stages (`audit`, `scrape`) must run on a real workstation. After running each
stage, commit the produced artifacts so the in-session agent can review them.

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
