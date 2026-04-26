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

## First action when picking up this repo

If this is a fresh checkout: read `PROJECT_PLAN.md` end-to-end, then execute the task list in **Appendix A** of that document, in order.
