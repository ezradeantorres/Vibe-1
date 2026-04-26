# PROJECT PLAN — Senior Living Site Outreach Pipeline

> **Working name:** TBD (placeholder: `silverlist`)
> **Owner:** Ezra Torres (CEO, Care.Life) + Ted (senior CS, U of U)
> **Date:** April 25, 2026
> **Audience for this document:** the autonomous coding agent (Claude Code or equivalent) that will execute Phase 1.

This document is the single source of truth for scope, architecture, and execution. The agent reading this should treat it as ground truth and prefer this over assumptions. Where decisions are explicitly marked **OPEN**, ask before proceeding; everywhere else, proceed without asking.

---

## 1. Mission

Build, in a single 5–6 hour work session, a working pipeline that:

1. Takes an existing list of senior living communities (Utah, 91 rows, included in repo as `data/utah_communities.csv`).
2. Audits each community's existing website against a defined rubric and flags the "bad" ones.
3. Scrapes each bad-website community's existing site for content (services, photos, copy, contact info).
4. Generates a polished, mobile-first, static HTML site for each, using the scraped context.
5. Deploys each generated site to Netlify under a non-public subdomain.
6. Outputs a per-community email-ready summary that a human can use to send personalized cold outreach.

The product offer is: **"I built you a new website. If you like it, $100/month and I'll point your domain at it."** Optional $250 setup fee. Sites that don't convert get torn down after a defined window.

This is a side project, not a Care.Life product. Branding, domain, and entity are TBD. Ship behind a generic placeholder until decided.

## 2. Validation context

The pattern was validated by Ezra prior to this project on a non-senior-living vertical: he scraped an epoxy floor company's existing site, used Claude to generate a replacement, and presented it to the owner as a free demo. The conversion mechanic works because (a) the prospect sees real polished work, not a pitch; (b) the cost to switch is low (point a DNS record); (c) the existing site is genuinely worse.

The senior living vertical was chosen because Ezra has direct relationships with mid-market operators through Care.Life and can put the demos in front of decision-makers within a week.

## 3. Pipeline architecture

```
data/utah_communities.csv
        │
        ▼
┌─────────────────────┐
│  Agent 1: Auditor   │  Reads website URL, scores against rubric (§7),
│                     │  outputs per-community audit JSON.
└─────────────────────┘
        │
        ▼ (filter: only "bad" sites)
┌─────────────────────┐
│  Agent 2: Scraper   │  Fetches HTML + assets, extracts structured
│                     │  context (name, services, copy, photo URLs,
│                     │  phone, hours, leadership), outputs JSON per community.
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  Agent 3: Generator │  Takes scraped JSON + chosen template, fills with
│                     │  AI-generated industry-appropriate copy, produces
│                     │  static HTML/CSS bundle per community.
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  Agent 4: Deployer  │  Pushes each site bundle to Netlify under a
│                     │  preview subdomain, returns deploy URL.
└─────────────────────┘
        │
        ▼
out/manifest.json — list of {community, deploy_url, audit_summary, photos_used}
                    used as input for the human email send.
```

**MVP target for hour 6 of the work session:** all four stages working end-to-end on **10 hand-picked communities**. The full 91-community run, the email automation agent, and any UI to manage the pipeline are explicit Phase 2 work.

## 4. Scope boundaries (explicit IN / OUT for Phase 1)

**IN scope:**
- All four agents, scriptable from CLI.
- One polished HTML template (mobile-first, three care-level variants togglable).
- Netlify deployment under a single project, with each community as a separate site or branch.
- Manual run on 10 communities chosen from the CSV.
- Per-community manifest output the human can use for email outreach.
- `noindex` meta + `robots.txt` blocking on every generated site.

**OUT of scope (Phase 2+):**
- Email-sending agent (the human hand-sends through a tool like Instantly).
- Any DIY editor/admin UI for operators to edit their generated site.
- Custom domain attachment (operators stay on subdomain until they convert).
- Multi-template selection logic.
- AI-generated images (use scraped photos only; if unusable, fall back to curated stock).
- CRM, billing, or subscription tooling.
- Automated takedown after N days (manually managed for now).
- States other than Utah.

## 5. Tech stack (locked decisions)

| Concern | Choice | Reason |
|---|---|---|
| Orchestration | Python 3.11+ (or Node 20+ — pick one and stick to it) | Either works; pick whichever Ted is faster in. Python preferred for scraping. |
| Web scraping | Playwright (preferred) or `httpx` + `selectolax` | Playwright handles JS-rendered sites; many SL sites are React/Wix. |
| AI generation | Anthropic API, model `claude-sonnet-4-5` (or current Sonnet) | Sonnet is the right cost/quality point for bulk generation. |
| Templating | Jinja2 (Python) or Eta (Node) | Static rendering, no client framework. |
| Output | Plain HTML + CSS + minimal vanilla JS | No build step. Each community is one folder with `index.html`, `styles.css`, `assets/`. |
| Hosting | Netlify | User specified. Use the Netlify CLI or API; one site per community OR one site with subdomain branches. |
| Image handling | Download referenced photos to `assets/`, optimize with `pillow` (Python) or `sharp` (Node) | Don't hotlink; that breaks when the source removes the file. |
| Storage | Local filesystem during MVP; structure designed to swap to S3 later | Keep paths abstracted. |
| Secrets | `.env` with `ANTHROPIC_API_KEY`, `NETLIFY_AUTH_TOKEN` | Standard `.env.example` checked in, real `.env` gitignored. |

**OPEN:** Python vs Node. Decide in the first 15 minutes based on Ted's preference. Default to Python if undecided.

## 6. Repository structure

```
/
├── README.md                    # 5-line orientation, links to this doc
├── PROJECT_PLAN.md              # this file (single source of truth)
├── CLAUDE.md                    # short instructions for Claude Code, references this file
├── .env.example
├── .gitignore
├── pyproject.toml               # if Python; package.json if Node
│
├── data/
│   ├── utah_communities.csv     # input lead list (91 rows)
│   └── selected_for_mvp.csv     # the 10 chosen for the work-session demo
│
├── src/
│   ├── audit.py                 # Agent 1
│   ├── scrape.py                # Agent 2
│   ├── generate.py              # Agent 3
│   ├── deploy.py                # Agent 4
│   ├── prompts/
│   │   ├── audit_rubric.md      # the rubric used by audit
│   │   ├── site_copy_system.md  # system prompt for site generation
│   │   └── site_copy_user.md.j2 # user prompt template, fed scraped JSON
│   ├── templates/
│   │   └── warm_traditional/    # the one MVP template
│   │       ├── index.html.j2
│   │       ├── styles.css
│   │       └── assets/
│   └── lib/
│       ├── llm.py               # Anthropic API wrapper
│       ├── netlify.py           # deploy wrapper
│       └── schema.py            # pydantic models for audit/scrape/site JSON
│
├── work/                        # gitignored — per-run outputs
│   ├── audits/{community_slug}.json
│   ├── scrapes/{community_slug}.json
│   ├── sites/{community_slug}/  # generated HTML bundle
│   └── deploys.json
│
└── out/
    └── manifest.json            # final summary for human review + email send
```

`community_slug` = lowercased name with non-alphanumeric → `-`, e.g. `legacy-house-of-ogden`.

## 7. Audit rubric (Agent 1)

Score each website on the criteria below. A community is "bad" (i.e., outreach candidate) if it fails **any 3 of the 6** criteria, or if any single criterion in the **critical** group fails.

**Critical (any single failure → bad):**
1. **Site loads.** HTTP 200, fully rendered DOM within 15s. (Failure → automatic "bad" — but flag for manual review since site might be broken.)
2. **Mobile-responsive.** No horizontal scroll on 375px viewport, body text >= 14px, no fixed-width layouts. Use Playwright with mobile emulation to check.
3. **Owns its identity.** The URL belongs to the community, not just a generic listing on a directory site (A Place For Mom, Caring.com). The Facebook-only listing in our data (`Rosetta Senior Living`) fails this.

**Standard (3+ failures → bad):**
4. **Has a clear primary CTA above the fold** (Schedule Tour / Contact Us / Call Now visible without scrolling).
5. **Last-updated signal looks recent** (no copyright date older than 2023, no "© 2018", no calendar of events from prior year).
6. **Lighthouse performance score >= 50** on mobile. (Use the Lighthouse Node module or the Playwright-Lighthouse integration.)

**Output JSON shape per community:**
```json
{
  "monday_item_id": "10583446704",
  "name": "Legacy House of Ogden",
  "url": "https://www.legacyretire.com/communities/legacy-house-of-ogden/",
  "fetched_at": "2026-04-25T...",
  "status_code": 200,
  "is_bad": true,
  "critical_failures": [],
  "standard_failures": ["no_primary_cta_above_fold", "low_lighthouse_score"],
  "scores": {
    "mobile_responsive": true,
    "owns_identity": true,
    "primary_cta_above_fold": false,
    "recent_update_signal": true,
    "lighthouse_perf": 38
  },
  "screenshot_path": "work/audits/legacy-house-of-ogden.png",
  "notes": ""
}
```

The full rubric prompt — including how to score "primary CTA above the fold" using a Claude vision call on the screenshot — lives in `src/prompts/audit_rubric.md`.

## 8. Scraper spec (Agent 2)

For each "bad" community, fetch and extract:

**Required fields:**
- `name` (string)
- `tagline` (string, if present in hero)
- `phone` (string, normalize to `+1-XXX-XXX-XXXX`)
- `address` (string)
- `services` (array of {name, description}) — extract anything matching "Independent Living", "Assisted Living", "Memory Care", "Respite Care", "Skilled Nursing"
- `amenities` (array of strings)
- `about_text` (string, the longest first-person/community-voice paragraph)
- `staff` (array of {name, title}) — only if shown publicly
- `hours` (string, if present)
- `photos` (array of {src_url, alt, downloaded_path, width, height}) — download them into `work/scrapes/{slug}/photos/`. Skip logos and icons (heuristic: width < 300 or filename contains "logo"/"icon").
- `existing_copy_blocks` (array of strings) — preserve original copy verbatim so the generator can paraphrase rather than invent.

**Implementation notes:**
- Use Playwright with `wait_until="networkidle"` for JS-heavy sites.
- Run a Claude extraction pass on the rendered HTML — reliably better than regex/CSS selectors across heterogeneous sites.
- Cap downloaded photos at 12 per community, prefer landscape over portrait, skip below 800x600.
- Preserve attribution metadata (source URL) in case takedown is requested later.

## 9. Generator spec (Agent 3)

**Inputs:** scrape JSON + chosen template name + community slug.

**Process:**
1. Call Claude with system prompt (industry guidance, see §10) + user prompt (scrape JSON).
2. Receive structured copy JSON: hero headline, subhead, about paragraph (rewritten, not copied), per-service descriptions, FAQ array, SEO meta title + description.
3. Render Jinja template with the structured copy + downloaded photos.
4. Output bundle to `work/sites/{slug}/`.

**Quality bar — every generated site MUST have:**
- Hero with community name, location, primary CTA ("Schedule a Tour"), and a hero image.
- Levels of care section (only for the levels they actually offer per the scrape).
- About section in warm, family-oriented voice — no medical claims, no superlatives that imply outcomes ("the best", "guaranteed").
- Photo gallery (3–6 photos minimum).
- FAQ section with 6 standard senior living questions answered in their voice.
- Lead capture form (POSTs to a Netlify form or a webhook — keep it static-form-compatible).
- Footer with name, address, phone, license number placeholder, ADA + Fair Housing icons.
- `<meta name="robots" content="noindex,nofollow">` in `<head>`.
- `/robots.txt` with `User-agent: * / Disallow: /`.
- A small unobtrusive "demo built for [community] by [your-name]" line in the footer that disappears once they accept the offer.

**Forbidden in generated copy:**
- Medical claims ("we treat", "we cure", "clinically proven").
- Specific pricing.
- Names of staff not present in the scrape.
- Testimonials — leave as a placeholder block the operator fills in after accepting.

## 10. Generation prompt structure

`src/prompts/site_copy_system.md` should be roughly this skeleton (refine in build):

> You are writing website copy for a mid-market independent senior living / assisted living community. The audience is adult children (45–65) researching options for an aging parent. Tone: warm, specific, locally rooted, never clinical. Avoid superlatives, medical claims, and stock-marketing phrases ("vibrant lifestyle", "world-class care", etc.). Use the community's actual scraped details. Output strictly the JSON schema provided. Never invent staff names, pricing, certifications, or services not present in the input.

`src/prompts/site_copy_user.md.j2` is a Jinja template that injects the scraped JSON and asks for the structured copy JSON output.

## 11. Deployer spec (Agent 4)

**Subdomain pattern:** `{slug}.{project-name}.netlify.app` or a custom apex like `{slug}.demo.silverlist.app` if a domain has been registered.

**Implementation:**
- Use Netlify CLI (`netlify deploy --prod --dir=work/sites/{slug}`) or the Netlify API directly.
- One Netlify site per community is the simplest approach for the MVP; switch to multi-tenant subdomain routing later.
- Capture the deploy URL into `work/deploys.json`.
- Set the site's `_headers` file with `X-Robots-Tag: noindex` as a belt-and-suspenders measure.

**OPEN:** Whether to register a project domain today or stay on `*.netlify.app`. Default: stay on `*.netlify.app` for MVP, register domain in Phase 2.

## 12. Final output: the manifest

`out/manifest.json` is the deliverable the human uses to send outreach:

```json
{
  "generated_at": "2026-04-25T22:00:00Z",
  "communities": [
    {
      "monday_item_id": "10583446704",
      "name": "Legacy House of Ogden",
      "address": "5526 Adams Ave, Ogden, UT 84405",
      "phone": "+1-801-436-5079",
      "original_url": "https://www.legacyretire.com/communities/legacy-house-of-ogden/",
      "demo_url": "https://legacy-house-of-ogden.silverlist.netlify.app",
      "audit_summary": "Site is mobile-responsive but lacks a clear above-the-fold tour CTA and scored 38 on mobile Lighthouse.",
      "photos_used_count": 6,
      "screenshot_before": "work/audits/legacy-house-of-ogden.png",
      "screenshot_after": "work/sites/legacy-house-of-ogden.png"
    }
  ]
}
```

## 13. Compliance, IP, and risk guardrails

These are non-negotiable:

1. **Every demo site is `noindex` + `robots.txt` blocked + `X-Robots-Tag: noindex` header.** No demo is ever discoverable through search engines.
2. **Subdomain pattern uses a slug, not the community's literal trademarked name** as the apex. `legacy-house-of-ogden.silverlist.netlify.app` is okay; `legacyhouseogden.com` is not.
3. **Don't alter logos.** If the operator's logo is scraped, use it as-is. If unavailable, use a wordmark-style text treatment.
4. **Photos: scraped only, attributed in metadata.** Never use a third party's marketing photos. If the source site has no usable photos, fall back to a single curated stock photo per community and note it in the manifest.
5. **Takedown SOP:** if any operator requests removal, deploy is deleted within 4 hours. Maintain a `takedowns.txt` log.
6. **Email outreach (Phase 2) must comply with CAN-SPAM:** physical address in footer, clear sender identity, working unsubscribe, no deceptive subject lines.
7. **The "demo built for X by Y" footer disclosure** makes intent transparent.

## 14. Cost / budget

Total budget for the project: **$300** (split between Ezra and Ted).

| Line item | Estimated cost (Phase 1) |
|---|---|
| Anthropic API (audit + scrape extraction + generation, ~91 communities × ~30K tokens avg) | $40–80 |
| Netlify | Free tier (100 sites, 100GB bandwidth/mo) |
| Domain registration (if pursued in Phase 2) | $15/yr |
| Email-sending tool (Instantly / Smartlead) Phase 2 | $30–100/mo |
| Buffer | Remainder |

Track actual spend in `BUDGET.md`.

## 15. Definition of done — hour 6

The work session succeeds if all of the following are true at hour 6:

1. ✅ 10 communities have been hand-picked from `data/utah_communities.csv` and saved to `data/selected_for_mvp.csv`.
2. ✅ The 4 agents run end-to-end via a single `make run-mvp` command (or equivalent script).
3. ✅ At least 8 of the 10 selected communities have a generated, deployed site reachable at a Netlify URL.
4. ✅ Each generated site renders correctly on mobile (Ezra eyeballs them on his phone).
5. ✅ `out/manifest.json` is populated with all 10 entries.
6. ✅ Ezra has identified the **first 3** communities he'll send personalized outreach to on Monday morning.

If any of these fail, the gap is documented in `RETROSPECTIVE.md` and addressed in Phase 2.

## 16. Open decisions (require human input)

These are intentionally not decided. Surface them when relevant; do not guess.

1. **Project name + domain.** Placeholder is `silverlist`. Ezra will decide.
2. **Python vs Node.** Resolve in first 15 minutes.
3. **Single Netlify site with branches vs. one site per community.** Resolve in deploy phase based on what's faster to wire up.
4. **The "Yeah" messaging style** Ezra mentioned for cold email. Phase 2 concern; capture his explanation when ready.
5. **Whether to update the `Communities` board in monday.com** with audit results / generated demo URLs. Phase 2 — for MVP, output stays in `out/manifest.json`.
6. **Whether and how to fold this back into Care.Life as a product**, or keep it as a side project entirely separate. Strategic decision for after MVP signal.

## 17. Phase 2 (after MVP signal)

In rough order of priority, not committed:

1. Run audit + generation across the full 91 Utah communities (and the other state groups: Arizona, Virginia, Idaho, Nevada, Colorado, Oregon, Washington, Georgia).
2. Build the email-sending agent with personalization tied to per-community audit summaries.
3. Add a second template (modern-active vibe) and template-selection logic.
4. Operator self-serve edit UI (probably a simple Decap CMS or Sanity-backed flow).
5. Custom domain attachment workflow (DNS instructions + verification).
6. Stripe billing for $100/mo subscription + optional $250 setup.
7. Auto-takedown after 21 days of no response.
8. Sync converted operators back into the monday.com Communities board with status update.

---

## Appendix A: First concrete tasks for the agent

The agent should execute these in order, asking only when an **OPEN** decision is hit:

1. Initialize the repo: `pyproject.toml`, `.env.example`, `.gitignore`, `README.md`, copy this file in as `PROJECT_PLAN.md`, copy `data/utah_communities.csv` into `data/`.
2. Write `src/lib/llm.py` (Anthropic wrapper with retries) and `src/lib/schema.py` (pydantic models for audit, scrape, copy, manifest).
3. Implement `src/audit.py` with the rubric in §7. Run on 5 communities to validate the rubric is calibrated correctly. Show output to Ezra before continuing.
4. Implement `src/scrape.py` with Playwright. Run on 3 communities flagged "bad" to validate extraction quality.
5. Implement `src/templates/warm_traditional/` — get one community looking *actually good* on a laptop and a phone before generating the rest. This is the make-or-break step.
6. Implement `src/generate.py` to fill the template from scrape JSON.
7. Implement `src/deploy.py` against Netlify.
8. Wire it all up in a top-level `run_mvp.py` (or `Makefile` target). Run on the 10 selected communities.
9. Generate `out/manifest.json`. Open each deploy URL in a browser. Eyeball.
10. Hand back to Ezra with a summary of which 8–10 sites turned out best.

If any step fails, surface the failure with logs and proposed fix; do not skip downstream steps silently.
