# Docs index

These are the topical references for this repo. Each doc has one focus and one audience. `CLAUDE.md` at the repo root is the universal entry point — read it first.

## What lives where

| Doc | Audience | When to read |
|---|---|---|
| [`architecture.md`](architecture.md) | Developer or AI agent | Whenever you need to understand how the editor → blob → bake → deploy loop works under the hood. Has a Mermaid sequence diagram. |
| [`runbook.md`](runbook.md) | Developer or AI agent | Whenever you need to operate the system — set env vars, configure the Netlify dashboard, kick a stuck bake, recover from a bad deploy. |
| [`content-model.md`](content-model.md) | Developer adding pages or sections | Whenever you need design tokens, component class names, the editable-surface contract, or the page skeleton. |
| [`troubleshooting.md`](troubleshooting.md) | Developer or AI agent debugging | The "11pm Friday" doc. Each entry is symptom-cause-fix. Skim the index table at the top to find your symptom. |
| [`worktree-inventory.md`](worktree-inventory.md) | Developer triaging old work | Once, when you want to know what's parked in `.claude/worktrees/` and whether any of it should be merged. |
| [`editor-handbook.md`](editor-handbook.md) | **Elena (non-technical)** | Send to Elena when she needs to learn how to edit her own site. Plain-language only — no dev jargon. |

For the senior-living pipeline design (which has not been built — see `architecture.md` §7), the canonical doc remains [`../PROJECT_PLAN.md`](../PROJECT_PLAN.md) at the repo root.

## Common operations → which doc

If you came in with a specific question, use this table to jump straight to the right place:

| Question | Doc |
|---|---|
| How does an edit get from Elena's browser to the live site? | `architecture.md` (sections 1-5) |
| Where does the password come from? What's the default? | `architecture.md` §3 (`otp.mjs`) or `runbook.md` §2 (env vars) |
| The bake is stuck — what now? | `runbook.md` §6 ("Recovery procedures") |
| I just changed an EDITABLE_SELECTOR; what else do I need to do? | `content-model.md` §5 ("Editable surfaces") |
| Why does Sam's page show "coming soon"? | `content-model.md` §7 + `CLAUDE.md` recent-work list |
| Where do booking form submissions go? Why isn't Elena getting them? | `runbook.md` §3 ("Netlify Forms") |
| What does the `.claude/worktrees/` directory contain and should I keep it? | `worktree-inventory.md` |
| How do I add a new editable surface (e.g., make a new CSS class editable)? | `content-model.md` §5 + `architecture.md` §2 |
| Editor signs in but text isn't saving / overlays land on wrong nodes | `troubleshooting.md` "Positional blob keys drift" and "EDITABLE_SELECTOR drift" entries |
| `*.netlify.app` is blocked from my Claude Code session | `troubleshooting.md` "Sandbox egress firewall" entry |
| Elena says "the edit pencil doesn't do anything" | `editor-handbook.md` §8 ("When something goes wrong") |
| Repo restructure: builds succeed but the site 404s | `troubleshooting.md` "Netlify dashboard config desync" entry |
| Whom does the editor authorize? Is there a whitelist? | `architecture.md` §3 + `runbook.md` §2 — single password, no whitelist |
| What's the difference between `info@…`, `etorres@…`, and `elena@…` references? | `troubleshooting.md` "Email surface confusion" entry |
| Is there a doc for the senior-living pipeline? | `../PROJECT_PLAN.md` (design only; code not built — see `architecture.md` §7) |

## Document hygiene

Each doc has an explicit anti-scope at the top so they don't drift into each other:

- `architecture.md` does not cover ops (→ `runbook.md`), components (→ `content-model.md`), or past mistakes (→ `troubleshooting.md`).
- `runbook.md` does not explain the edit loop (→ `architecture.md`) or describe components (→ `content-model.md`).
- `content-model.md` does not explain the runtime (→ `architecture.md`) or list past gotchas (→ `troubleshooting.md`).
- `troubleshooting.md` does not introduce architecture concepts (→ `architecture.md`) or list parked work (→ `worktree-inventory.md`).
- `editor-handbook.md` does not reference any developer-facing internals — it's plain English for Elena and never links to the other docs.

If you find yourself wanting to put information in two places, pick one and link to it from the other. Duplicating gets out of sync, and out of sync is worse than missing.

## Updating these docs

These are living references. If you ship a change that invalidates a section, update the relevant doc in the same commit. The CLAUDE.md "Recent session work" appendix is updated by appending — don't rewrite history there. The `troubleshooting.md` index table at the top should stay in sync with the H2 headings below it.

The `hidden-gem/editor_setup.md` file is the historical setup notes for an earlier email-OTP variant of the editor. It has a deprecation banner at the top pointing at `docs/architecture.md`. Leave it in place as the durable record of the OTP design (which `worktree-inventory.md` references); don't delete it.
