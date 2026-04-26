# RUNBOOK — Phase 1 MVP

Operator-facing commands for executing the pipeline. The Claude Code editing
sandbox can't install a browser or reach external sites, so the Playwright
stages (`audit`, `scrape`) must run on a real workstation. After running each
stage, commit the produced artifacts so the in-session agent can review them.

## Current state (2026-04-26 — second update) — read this first

> **Maintenance rule:** This section is the live handoff surface between
> operators and sessions. Whoever is the in-session agent must keep it
> current — update it (and bump the date in the heading) in the same commit
> whenever a decision is locked/revised, a blocker is resolved or added, a
> pipeline stage changes status, or a new community is selected/finished.
> See `CLAUDE.md` Operating principle 7.

**Operators on deck:** Ezra + Ted. Either of you can run the steps below.
**Active branch:** `silverlist/phase-1-mvp`. All work commits here. `main`
is the deploy branch — only merge a community's `public/<slug>/` into `main`
once Ezra approves it on his phone.

**Decisions locked in this session:**

- **Community #1:** Sunflower Ridge Assisted Living
  (`https://sunflowerridgeassistedliving.com/`). Already in
  `data/selected_for_mvp.csv` as `manual-0001`.
- **Visual reference for the template:** Meridian Senior Living's Crescent
  page —
  `https://www.meridiansenior.com/senior-living/ut/sandy/crescent-senior-living/`.
  Goal stated by Ezra: *"their community colors, photos, info, and more
  modern buttons and style."* Use Meridian's layout/IA as the structural
  reference; pull colors + photos + copy from each individual community.
- **Phase 1 LLM mode:** manual, in-session (per `CLAUDE.md`). No
  `ANTHROPIC_API_KEY` needed. `src/lib/llm.py` is intentionally not built.
- **Deploy target:** `https://assistedwebsite.netlify.app/<slug>/` via
  Netlify ↔ GitHub auto-deploy on push to `main`.

**Netlify project facts (for debugging):**

- Project name: `assistedwebsite`
- Project ID (Site ID): `88c4e572-0e72-4aea-a0b8-cd6775db8553`
- Owner: `Hidden Gem`
- Connected to repo `ezradeantorres/Vibe-1` — GitHub webhook confirmed
  firing (last deploy was triggered automatically on push).
- Production URL: `https://assistedwebsite.netlify.app/`

**What's now built on this branch (since the prior update):**

- `src/audit.py` — deterministic checks + screenshot per row (was already there)
- `src/scrape.py` — Playwright render + photo download (was already there)
- `src/lib/paths.py`, `src/lib/schema.py` — pipeline contracts. Schema **extended** with optional rich CopyResult fields: `hero_stats`, `differentiators`, `trust_badges`, `rich_amenities`, `welcome_quote`, `welcome_paragraph`, `pricing` (CopyPricing), `cta_strip_headline`, plus per-community brand overrides `theme_ink_bg / theme_sage / theme_amber`. Existing fields still validate.
- `src/generate.py` — **NEW.** CLI `python -m src.generate <slug>`. Loads audit + scrape + copy JSONs; renders Jinja; copies referenced photos; upserts `out/manifest.json`. Smart `img_src` filter handles both URLs and local paths. Per-community brand colors injected as inline `<style>` overriding CSS custom properties.
- `src/templates/warm_traditional/` — **NEW.** Design language ported from `Dashboard/sunflower-ridge.html` (Inter + Fraunces, deep-ink + sage + amber palette). Template sections: util bar → sticky header → hero (with stats) → trust band → welcome (image + badge) → care cards → "Three things differently" pillars (dark) → amenities (4-col) → gallery (4-col w/ span variants) → pricing card (dark) → FAQ → visit + lead form → sage CTA strip → dark footer with disclosure. All sections optional based on what the CopyResult fills in.
- `out/manifest.json` — first entry: Sunflower Ridge.
- `public/sunflower-ridge-assisted-living/` — fully rendered demo bundle.
- `work/audits/sunflower-ridge-assisted-living.{json}` — audit ran, `is_bad=true`. Screenshot was NOT produced because httpx HTTP probe failed before Playwright was attempted (TLS cert SAN mismatch).
- `work/scrapes/sunflower-ridge-assisted-living/{scrape.json, SCRAPE_FAILED.md}` — scrape was blocked by anti-bot; failure modes documented; scrape.json populated by the in-session agent with confirmed real fields (address, phone, email, hours).
- `work/copy/sunflower-ridge-assisted-living.json` — full CopyResult written by the in-session agent using real Sunflower Ridge data extracted from `Dashboard/sunflower-ridge.html` (which Ezra had already produced as a hand-crafted reference). No invented staff/services. Pricing ($2,900–$4,300/mo, $3,600 avg) reflects confirmed numbers from that file.

**Sunflower Ridge data we now have (used by generate.py):**
- Phone: (801) 397-5544 · Email: hello@sunflowerridge.com · Hours: Mon–Sun · 8a–8p
- Address: 41 East Center Street, Centerville, UT 84014
- Care levels offered: Assisted Living, Memory Care, Adult Day Care, Respite Care
- Hero stats: 8 residents · 24/7 caregiver presence · 4 care types · $3,600 avg/mo
- 12 amenities with descriptions; 4 trust badges; 3 differentiators ("The Sunflower Ridge Way"); 6 FAQs
- 6 hand-verified senior-community-appropriate Unsplash photo URLs in the gallery (others were swapped out — random Unsplash IDs return wildly off-topic content, see "Photo strategy" below)

**Source-of-truth note:** `Dashboard/sunflower-ridge.html` (in Ezra's Dashboard project, NOT in this repo) is the hand-crafted polished single-file demo Ezra had ready. The Vibe-1 template was rewritten to match its design language. The two are now divergent in scope: the Dashboard file has extra sections (3-card teaser, day-in-life, voices/testimonials) the pipeline template omits — those would require additional schema fields to add to the pipeline.

**Photo strategy (lessons learned today):**
- The site's anti-bot blocks Playwright entirely (chromium-headless-shell, full chromium, AND `channel='chrome'` real Chrome — all timeout with stealth flags). WebFetch fails on TLS. Detail in `work/scrapes/sunflower-ridge-assisted-living/SCRAPE_FAILED.md`.
- Random Unsplash IDs are unreliable — out of ~12 sampled, half were on-vibe (warm interiors, dining, garden), the rest were wildly wrong (Toronto skyline, milky way silhouette, scientist at microscope, Curology cleanser, food bowls).
- For the **demo to actually send to a prospect**, the operator must source real photos from them per PROJECT_PLAN §13. The Unsplash URLs in `work/copy/sunflower-ridge-assisted-living.json` are placeholder-quality only, and noted as such in the manifest.

**Three blocking items waiting on the operator (unchanged, all on Ezra/Ted):**

1. **Fix Netlify publish directory.** Still misconfigured. Same fix as before:
   Netlify dashboard → site `assistedwebsite` → **Build & deploy →
   Continuous deployment** → Production branch: `main`, Publish directory: `public`,
   Build command: (empty) → Save → Deploys tab → **Trigger deploy → Deploy site**.

   Verify after:
   ```bash
   curl -sS https://assistedwebsite.netlify.app/ | grep -i "private staging"
   curl -sS https://assistedwebsite.netlify.app/robots.txt
   curl -sS -I https://assistedwebsite.netlify.app/ | grep -i x-robots-tag
   # expect: x-robots-tag: noindex, nofollow
   ```

2. **Merge `silverlist/phase-1-mvp` → `main`** (or cherry-pick `public/sunflower-ridge-assisted-living/`) once Ezra approves the demo on his phone. Per CLAUDE.md, only the `public/<slug>/` folders are merged; everything else stays on the dev branch.

3. **Drop the Meridian/Crescent reference screenshot** at `references/meridian-crescent-fullpage.png` — still pending, but lower priority now that the template has been built using `Dashboard/sunflower-ridge.html` as the lived-in reference.

**Next planned community: Abbington Senior Living, Layton UT** (`abbingtonseniorliving.com/layton-utah`). Plan:
- Add row to `data/selected_for_mvp.csv`.
- Try `python -m src.audit` and `python -m src.scrape` (likely blocked by anti-bot, same as SR).
- Use WebFetch to extract their address/phone/services + identify their **brand colors**.
- Write `work/copy/abbington-senior-living-layton.json` with `theme_ink_bg / theme_sage / theme_amber` set to Abbington's palette so each community keeps its own identity.
- `python -m src.generate abbington-senior-living-layton`.

**Local preview:**
```bash
source .venv/bin/activate
python -m http.server 8000 --directory public
# laptop: http://localhost:8000/sunflower-ridge-assisted-living/
# phone (same wifi): http://<your-LAN-IP>:8000/sunflower-ridge-assisted-living/
```

**One-time setup (if Ted is fresh-cloning):**
```bash
git checkout silverlist/phase-1-mvp && git pull
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
python -m playwright install chromium
```
No `.env` values are required for Phase 1.

**Note on branch naming:** any task description that mentions
`claude/create-epoxy-flooring-site-Tuqm1` is an auto-generated branch name
from a previous unrelated session and should be ignored. Develop on
`silverlist/phase-1-mvp`.

## Why these blockers run on the operator's laptop, not in-session

The Claude Code editing sessions this repo is touched in (when started
from claude.ai or the Claude mobile/web app) run in a cloud container
with **no MCP servers attached** (`mcpServers: {}`) and a strict outbound
host denylist. Every external host involved in the three blockers
(`assistedwebsite.netlify.app`, `meridiansenior.com`,
`sunflowerridgeassistedliving.com`, the Playwright download CDN, Google's
Chrome download CDN) returns `host_not_allowed` on `curl` and `WebFetch`.
There's no Chrome/Chromium binary installed and no `sudo` to install one.
That's why all three blockers run on the operator's laptop, not in-session.

The **claude.ai Chrome connector is a separate surface** from Claude
Code's MCP servers. They share an account but not a tool surface — a
connector enabled on claude.ai does NOT propagate to Claude Code
sessions, and vice versa.

To run a Claude Code session that *can* drive Chrome and the network
end-to-end (i.e., do all three blockers in one go without operator
hands), run it locally on your laptop with Playwright MCP attached:

```bash
npm install -g @anthropic-ai/claude-code
cd ~/path/to/Vibe-1
claude mcp add playwright npx '@playwright/mcp@latest'
claude
```

That session has Playwright's bundled Chromium + your laptop's network
+ filesystem + git, so it can hit the Netlify dashboard, capture the
Meridian screenshot, run `python -m src.audit`, and push the artifacts
all in one chat.

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
