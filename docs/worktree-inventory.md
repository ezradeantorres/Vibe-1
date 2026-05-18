# Parked sub-agent worktree inventory

Snapshot of the nine `git worktree` directories sitting under `.claude/worktrees/` at the time this doc was written. Each one is the still-checked-out output of a parallel sub-agent from a single Hidden Gem sprint; some of that output landed on `main`, some was superseded by later decisions, some has not yet been touched. This file is the institutional memory of those efforts.

## 1. Overview

Each subdirectory under `.claude/worktrees/` is a real git worktree (`git worktree add`) on its own branch named `worktree-agent-<id>`. They were created by the `Agent` tool with `isolation: "worktree"` during a sprint that ran several sub-agents in parallel, each given a discrete Hidden Gem improvement. Every worktree contains exactly one commit on top of the same shared base, `3c5cbd3 Bake Hidden Gem edits from Netlify Blobs`. `main` has moved 52 commits forward since that base.

`.claude/worktrees/` is gitignored at the repo root (see `.gitignore`), so these worktrees exist only in this local checkout. A fresh clone will not see them, and the underlying branches likewise live only on this machine unless someone has pushed them. **This document IS the durable record.** Once these worktrees are removed, the only way back to that work is via this file plus the branch HEAD hashes listed below.

Two cross-cutting gotchas from `CLAUDE.md` apply to interpreting any of these:

- `isolation: "worktree"` does not sandbox file writes against absolute paths, so an agent that was prompted with `/home/user/Vibe-1/hidden-gem/...` could have leaked edits into the main tree during its original run. When deciding what to do with a worktree, check both the worktree's own one-commit diff (the only authoritative record of what that agent intended) AND whether the same files in `main` already moved in a related direction.
- Worktrees branched from a commit predating `.claude/worktrees/` being added to `.gitignore`, so each one's `git diff main` will show a stale `.gitignore` entry being "removed." That is baseline drift, not real intent.

The right diff to inspect for intent is `git -C <worktree-path> diff HEAD^..HEAD`, not `git diff main`. The branch-vs-main view is misleading because main has since added five new pages, a mega-menu nav, a Beta Care-Fit quiz, content-addressable editor keys, etc. — all of which the worktree happens not to contain.

## 2. Inventory table

| Directory | Branch | Latest commit | Topic | Recommendation |
|---|---|---|---|---|
| `agent-a09e24280ce23ab27` | `worktree-agent-a09e24280ce23ab27` | `3e33f4a` "Add 'What Clients Say' testimonials section to Hidden Gem home" | Testimonials | Retire |
| `agent-a16dbbd43a1f618e2` | `worktree-agent-a16dbbd43a1f618e2` | `f10fd55` "Hidden Gem: add og:image, twitter:card, and MedicalBusiness JSON-LD" | SEO meta + JSON-LD | Retire |
| `agent-a2529dce82182c261` | `worktree-agent-a2529dce82182c261` | `8308691` "Replace info@ with elena@ contact email across Hidden Gem pages" | Visible mailto swap | Revisit |
| `agent-a8efe3ca9dac0b7a5` | `worktree-agent-a8efe3ca9dac0b7a5` | `c7144f1` "hidden-gem: WCAG 2.1 AA conservative accessibility pass" | WCAG accessibility | Revisit |
| `agent-a941a7a530f73c719` | `worktree-agent-a941a7a530f73c719` | `74c1bca` "Gate Hidden Gem editor behind email OTP" | Editor OTP via email | Retire |
| `agent-a95de8e2b787c29ab` | `worktree-agent-a95de8e2b787c29ab` | `d19af85` "hidden-gem: add /thanks.html and point appointment form at it" | Thanks-page redirect | Retire |
| `agent-abf0e03eec835ad6c` | `worktree-agent-abf0e03eec835ad6c` | `45107a1` "hidden-gem: add pretty-URL rewrite and branded 404 page" | Pretty URLs + 404 | Retire |
| `agent-ae9023baec0fb33a1` | `worktree-agent-ae9023baec0fb33a1` | `f23ad51` "hidden-gem: add Plausible Analytics with Book Click event tagging" | Plausible analytics | Revisit |
| `agent-af321866fc05023f4` | `worktree-agent-af321866fc05023f4` | `27d508d` "Improve Hidden Gem appointment form UX" | Form UX (preferred_contact, time, banner) | Retire |

Tally: **6 Retire, 0 Merge, 3 Revisit.** The three Revisit rows are elena@ mailto swap (`a2529dce`, leans Retire pending one user decision), WCAG (`a8efe3ca`, useful checklist but the Sara-dropdown work needs reframing for the current mega-menu nav), and Plausible (`ae9023ba`, unshipped and blocked on a paid-analytics product decision plus a canonical-domain fix). The six Retires are work that has either been shipped on `main` via an explicit integration commit or was deliberately reversed.

### How to inspect any of these yourself

From the repo root:

```bash
# The "what did this agent intend" diff — authoritative.
git -C .claude/worktrees/<dir> log -1 --format='%H %s%n%n%b'
git -C .claude/worktrees/<dir> diff HEAD^..HEAD

# The "how does it sit against today's main" diff — noisy because
# main has 52 commits of progress the worktree never picked up.
git -C .claude/worktrees/<dir> diff main --stat
```

Always lead with the `HEAD^..HEAD` diff. The `diff main --stat` view shows a few thousand "deleted" lines that the worktree did not actually delete — they are new files (Sam, Keira, Privacy, No Surprises Act, 404), new editor logic (content-addressable hashes, password OTP, save-bar auth gating), and design-token refactors that landed on `main` after these branches were created. Treat `diff main` only as a "does this still apply cleanly" probe, not as a description of the change.

## 3. Per-worktree detail

### `agent-a09e24280ce23ab27` — testimonials section on home

- **Path**: `.claude/worktrees/agent-a09e24280ce23ab27`
- **Branch**: `worktree-agent-a09e24280ce23ab27`
- **Latest commit**: `3e33f4a4806376d30bc98d3782b0e389b161ee8f` — "Add 'What Clients Say' testimonials section to Hidden Gem home" — Claude <noreply@anthropic.com> — 2026-05-18 00:08:11 +0000
- **Files changed in this branch's one commit**: 2 — `hidden-gem/index.html` (+29), `hidden-gem/css/styles.css` (+30)
- **What it does**: Inserts a "What Clients Say" / "Voices" section between Trust Bar and Locations Map on `index.html` with three placeholder testimonial cards (Jordan T., Maria S., Tom R.) clearly marked in inline comments as stand-ins until real consent is collected. Adds `.testimonials`, `.testimonials-grid`, `.testimonial-card`, and `.testimonials-footnote` rules with a 720px single-column breakpoint.
- **Conflict with current state**: `main` shipped a different testimonials trio on home in commit `b9f683d` ("Home page: add private-pay positioning + placeholder testimonials trio"). The shipped version uses a "Voices From Our Practice" eyebrow and three different placeholder quotes ("Patient, 30s/40s/50s"), with its own `.testimonials*` CSS already defined. The worktree's copy is similar in shape but the wording, attribution style ("Jordan T., adult psychiatric care" vs anonymous), and the eyebrow text ("Voices" vs "Voices From Our Practice") differ. The same DOM region is already occupied.
- **Verify on main**: `grep -nE "testimonials-grid|What Clients Say|Voices From Our Practice" hidden-gem/index.html` — should return matches around line 318 onward.
- **Recommendation**: **Retire.** The feature is already shipped on `main` with deliberately-chosen copy. There is nothing here that improves on what is live. Merging would either revert chosen copy or produce duplicate-section ugliness. `git worktree remove .claude/worktrees/agent-a09e24280ce23ab27 && git branch -D worktree-agent-a09e24280ce23ab27`.

### `agent-a16dbbd43a1f618e2` — og:image, twitter:card, MedicalBusiness JSON-LD

- **Path**: `.claude/worktrees/agent-a16dbbd43a1f618e2`
- **Branch**: `worktree-agent-a16dbbd43a1f618e2`
- **Latest commit**: `f10fd55be9a6cefe8a5c04ff5764807131058992` — "Hidden Gem: add og:image, twitter:card, and MedicalBusiness JSON-LD" — Claude <noreply@anthropic.com> — 2026-05-18 00:06:58 +0000
- **Files changed in this branch's one commit**: 5 — `hidden-gem/{index,about,abbey,sara-equine,sara-psychiatric}.html` (+30 lines each)
- **What it does**: Adds `og:image` (pointing at `hero-sara-horses.jpg`), `twitter:card=summary_large_image`, and a Schema.org `MedicalBusiness` JSON-LD block (telephone, email, Holladay address, geo, sameAs Instagram/Facebook) to all five pages it knew about.
- **Conflict with current state**: `main` already ships all of this. Commit `b5b1e9e` ("Integrate agent 3: SEO <head> enrichment") landed the JSON-LD and og:image, and `7c68494` ("Fix og:image and JSON-LD url to canonical hiddengemhealingutah.com domain") corrected the domain. Current main JSON-LD uses `https://hiddengemhealingutah.com` and email `info@hiddengemhealingutah.com`. The worktree version uses `https://hiddengem.com` (wrong canonical) and `elena@hiddengemhealingutah.com` (wrong visible contact per `CLAUDE.md`'s "send an email to X" lesson). The worktree also only covers five pages — there are now seven (Sam and Keira pages were added later) all of which already carry JSON-LD.
- **Verify on main**: `grep -lE "og:image|application/ld\+json" hidden-gem/*.html` returns all seven page files. The canonical URL inside the JSON-LD is `https://hiddengemhealingutah.com` (worktree had `https://hiddengem.com`).
- **Recommendation**: **Retire.** Feature shipped, with corrections the worktree never received. Merging would actively regress the canonical domain and the visible contact email. `git worktree remove .claude/worktrees/agent-a16dbbd43a1f618e2 && git branch -D worktree-agent-a16dbbd43a1f618e2`.

### `agent-a2529dce82182c261` — `info@` → `elena@` visible mailto swap

- **Path**: `.claude/worktrees/agent-a2529dce82182c261`
- **Branch**: `worktree-agent-a2529dce82182c261`
- **Latest commit**: `83086915c6d9ed2c94640934767f06a82a649e29` — "Replace info@ with elena@ contact email across Hidden Gem pages" — Claude <noreply@anthropic.com> — 2026-05-18 00:09:01 +0000
- **Files changed in this branch's one commit**: 5 — `hidden-gem/{index,about,abbey,sara-equine,sara-psychiatric}.html` (≈1-2 lines each)
- **What it does**: Replaces visible-text `info@hiddengemhealingutah.com` and `mailto:info@…` links with `elena@…` across the five pages it knows about. Footer and About-page contact block both flipped.
- **Conflict with current state**: `CLAUDE.md` says explicitly: *"For the Hidden Gem site today: visible mailto links are `info@hiddengemhealingutah.com`; Netlify Form submissions notify `etorres@care.life` (test) and will move to `elena@…` for production; OTP delivery is gated to the whitelist…"* So the current deliberate choice is to keep visible mailto as `info@`. The OTP/notification side is handled separately in Netlify dashboard + Resend config. Doing this swap would conflate the three email surfaces that `CLAUDE.md` warns about and ship a visible-to-the-world contact that the current site intentionally does not show.
- **Verify on main**: `grep -oh "mailto:[^\"']*" hidden-gem/*.html | sort -u` → only `mailto:info@hiddengemhealingutah.com`.
- **If revisiting**: scope expanded to seven pages (Sam, Keira, privacy, no-surprises-act, 404 are now also in `hidden-gem/`); also check the JSON-LD `"email"` field on every page; also confirm the Netlify Forms notification recipient in the dashboard hasn't already been routed to Elena (in which case the visible swap is the only remaining step).
- **Recommendation**: **Revisit (lean Retire).** Open question for the user: *do you actually want the public mailto links to route directly to Elena, or keep the `info@` alias as the visible address and continue routing to Elena under the hood?* If the answer is "keep `info@` visible," retire this. If the answer flips, this diff is the cheapest implementation — just be aware it only covers five pages and Sam/Keira/privacy/no-surprises-act/404 must be done in parallel.

### `agent-a8efe3ca9dac0b7a5` — WCAG 2.1 AA conservative pass

- **Path**: `.claude/worktrees/agent-a8efe3ca9dac0b7a5`
- **Branch**: `worktree-agent-a8efe3ca9dac0b7a5`
- **Latest commit**: `c7144f1002a26b6dc2839e19d2d4b49f5ff64304` — "hidden-gem: WCAG 2.1 AA conservative accessibility pass" — Claude <noreply@anthropic.com> — 2026-05-18 00:13:28 +0000
- **Files changed in this branch's one commit**: 7 — `hidden-gem/about.html` (+22), `hidden-gem/js/main.js` (+52), `hidden-gem/css/styles.css` (+9), `hidden-gem/{index,abbey,sara-equine,sara-psychiatric}.html` (+8 each)
- **What it does**: Five things: (1) wires booking-form `label for=`/`input id=` pairs on `about.html`; (2) marks the active top-level nav link per page with `aria-current="page"`; (3) gives the hamburger `id="mobile-menu"` + `aria-controls` + `aria-expanded` toggling + keyboard activation (Enter/Space); (4) converts the empty-href "Sara" dropdown trigger into a keyboard-operable button with `role="button"`, `tabindex="0"`, `aria-haspopup="menu"`, Escape-to-close, focusout-to-close; (5) adds a `:focus-visible` outline using the `--sage` token with a 2px offset.
- **Conflict with current state**: Mixed. (1) is already shipped — main's `about.html` has all the `for`/`id` pairs and even more than the worktree (worktree only did about.html, but main has them on Sam/Keira form picker etc.). (2), (3), (4) target a nav structure that no longer exists — main's nav was restructured in commit `c980760` ("Nav cleanup + SVG mega-menu") to a "Services" mega-menu trigger replacing the "Sara" dropdown, on a real anchor link with `aria-haspopup="true"`. Main has partial dropdown `aria-expanded` toggling on hover/focusin/focusout but no `aria-current`, no `aria-expanded` on the hamburger, no `id="mobile-menu"`/`aria-controls`, no Escape-to-close. (5) is unshipped — `:focus-visible` is not styled in current `styles.css`.
- **Verify on main**: `grep -E "aria-current|aria-controls|id=\"mobile-menu\"|focus-visible" hidden-gem/*.html hidden-gem/css/styles.css hidden-gem/js/main.js` — only the abbey-tabs `aria-controls="tab-…"` matches return; the nav-level a11y additions are absent.
- **If revisiting**: salvageable now without conflict — the `:focus-visible` outline (CSS-only), the hamburger ARIA wiring (works against any markup), `aria-current="page"` on whichever active link matches `document.body.dataset.page`. The Sara-trigger work needs reframing for the new "Services" mega-menu trigger (which already has `aria-haspopup="true"`/`aria-expanded` but no Escape handler or programmatic toggle).
- **Recommendation**: **Revisit.** The intent is good and several of these gaps are still live on main, but the diff cannot apply cleanly because the nav restructure invalidates the Sara-dropdown work. Useful as a checklist, not as a patch. Open question for the user: *should we re-run an accessibility pass against the current mega-menu nav?* If yes, the priorities salvageable from this branch are the focus-visible outline, the hamburger `aria-expanded`/`aria-controls`/keyboard handlers, and `aria-current="page"` on the active nav link.

### `agent-a941a7a530f73c719` — editor gated by email OTP via Resend

- **Path**: `.claude/worktrees/agent-a941a7a530f73c719`
- **Branch**: `worktree-agent-a941a7a530f73c719`
- **Latest commit**: `74c1bcae4eb2b424abadd15e605f3a17fe6e9777` — "Gate Hidden Gem editor behind email OTP" — Claude <noreply@anthropic.com> — 2026-05-18 00:15:10 +0000
- **Files changed in this branch's one commit**: 7 — `hidden-gem/netlify/functions/otp.mjs` (new, +154), `hidden-gem/js/editor.js` (+407), `hidden-gem/editor_setup.md` (+235), `hidden-gem/css/editor.css` (+176), `hidden-gem/netlify/functions/{content,image,lock}.mjs` (+18/19/19 token-check additions)
- **What it does**: Adds `otp.mjs` with a hard-coded two-address whitelist (`etorres@care.life`, `elena@hiddengemhealingutah.com`) that sends six-digit codes via Resend and mints 32-hex tokens with a 4-hour TTL stored in the `site-otp` Netlify Blob. Adds `x-hg-token` header requirement on POST to `content`/`image`/`lock`; reads stay public. Replaces the floating "Edit" button with a discreet "edit" link in the footer, plus an in-page email→code modal. Documents Resend signup, env var, and whitelist rotation.
- **Conflict with current state**: Superseded. `main` commit `5ac0cb7` ("Editor: drop email-OTP, gate on shared password 'chloe'; appointment from care.life") explicitly removed email-OTP and replaced it with a single-password flow on the same `/.netlify/functions/otp` endpoint, reusing the `site-otp` blob namespace. The current `otp.mjs` even has a comment: *"This file used to run an email-OTP flow via Resend; that was replaced by a shared password because Resend's free tier requires a verified sender domain, and the editing surface is small enough that a single rotating password is acceptable."* The hidden-footer-link UX from this worktree is also shipped, but the auth model is now password-only.
- **Verify on main**: `head hidden-gem/netlify/functions/otp.mjs` — the doc-comment explicitly narrates the migration off email-OTP. `editor.js` POSTs `{ password }` not `{ action: "request", email }`.
- **Recommendation**: **Retire.** The whole approach was explicitly reversed. A future "add email OTP back" decision would not start from this branch anyway — Resend's verified-sender constraint was the actual blocker, and the password flow is structured to allow re-introducing OTP without ripping things up. `git worktree remove .claude/worktrees/agent-a941a7a530f73c719 && git branch -D worktree-agent-a941a7a530f73c719`.

### `agent-a95de8e2b787c29ab` — dedicated `/thanks.html` post-submit page

- **Path**: `.claude/worktrees/agent-a95de8e2b787c29ab`
- **Branch**: `worktree-agent-a95de8e2b787c29ab`
- **Latest commit**: `d19af854a37e3f011b902955f6d4b97a4adeaa4b` — "hidden-gem: add /thanks.html and point appointment form at it" — Claude <noreply@anthropic.com> — 2026-05-18 00:09:36 +0000
- **Files changed in this branch's one commit**: 2 — `hidden-gem/thanks.html` (new, +105), `hidden-gem/about.html` (form `action="/thanks.html"`)
- **What it does**: Adds a dedicated thank-you page (shared nav and footer, no editor scripts, `noindex`) with a centered hero, "Got it.", an H1 confirming the request reached Elena, a one-business-day expectation plus phone fallback, and two CTAs back into the site. Repoints the appointment form action away from the `/about?submitted=true#contact` query-string round trip to `/thanks.html`.
- **Conflict with current state**: Superseded twice. Main commit `c3aa095` first added a thanks page; commit `563e9c3` then *removed* it: "Form submits via AJAX with inline success; drop thanks.html and Resend hook." The current flow on main does `fetch(POST)` of the form data, shows an inline `role="status"` success banner on the same page, and falls back to the `/about?submitted=true#contact` round trip if JS is disabled. That decision is durable; a dedicated thanks page is no longer the desired UX.
- **Verify on main**: `ls hidden-gem/thanks.html` returns "No such file" and `grep -nE "submitted=true|role=\"status\"" hidden-gem/about.html` shows the inline-banner script around line 537.
- **Recommendation**: **Retire.** Decision reversed; the AJAX-with-inline-banner flow is intentionally what ships. `git worktree remove .claude/worktrees/agent-a95de8e2b787c29ab && git branch -D worktree-agent-a95de8e2b787c29ab`.

### `agent-abf0e03eec835ad6c` — pretty-URL rewrite + branded 404

- **Path**: `.claude/worktrees/agent-abf0e03eec835ad6c`
- **Branch**: `worktree-agent-abf0e03eec835ad6c`
- **Latest commit**: `45107a15718a111e18269abb7223ddf5542e53ca` — "hidden-gem: add pretty-URL rewrite and branded 404 page" — Claude <noreply@anthropic.com> — 2026-05-18 00:06:34 +0000
- **Files changed in this branch's one commit**: 2 — `hidden-gem/404.html` (new, +74), `hidden-gem/netlify.toml` (+16/-3)
- **What it does**: Replaces the soft-404 catch-all `/* -> /index.html status=404` with a `/:slug -> /:slug.html status=200 force=false` rewrite so `/about` renders `about.html` with a real 200, plus an explicit `/.netlify/*` pass-through. Adds a branded `404.html` with shared nav, centered hero, trimmed footer.
- **Conflict with current state**: Superseded. Main commit `fe4b217` ("Drop the soft-404 redirect; add pretty-URL rewrite + functions pass-through") landed the same `netlify.toml` change — though main subsequently dropped the `/.netlify/*` rule after deploy logs flagged it as invalid (`"Invalid /.netlify path in redirect source"`), per the comment in the current `netlify.toml`. The branded 404 page is also shipped (`8e80418` "Add Privacy Practices, No Surprises Act, and custom 404 pages"), and the version on main is substantially more developed than the worktree (full mega-menu nav, Beta Care-Fit cross-link, etc.).
- **Verify on main**: `cat hidden-gem/netlify.toml` — has the `/:slug` rewrite and a comment explaining why the `/.netlify/*` rule was removed. `ls hidden-gem/404.html` exists.
- **Recommendation**: **Retire.** Both halves are shipped, with main's versions strictly more complete and one redirect rule already correctly removed. Re-landing the worktree's `netlify.toml` would actually regress by re-introducing the invalid `/.netlify/*` rule that broke the deploy log. `git worktree remove .claude/worktrees/agent-abf0e03eec835ad6c && git branch -D worktree-agent-abf0e03eec835ad6c`.

### `agent-ae9023baec0fb33a1` — Plausible analytics with Book Click event

- **Path**: `.claude/worktrees/agent-ae9023baec0fb33a1`
- **Branch**: `worktree-agent-ae9023baec0fb33a1`
- **Latest commit**: `f23ad517fc24a9924a46469aaad1c825c6b3bba8` — "hidden-gem: add Plausible Analytics with Book Click event tagging" — Claude <noreply@anthropic.com> — 2026-05-18 00:17:21 +0000
- **Files changed in this branch's one commit**: 5 — `hidden-gem/{index,about,abbey,sara-equine,sara-psychiatric}.html` (≈4-12 lines each)
- **What it does**: Inserts a `<script defer data-domain="hiddengem.com" src="https://plausible.io/js/script.tagged-events.outbound-links.js">` plus a head comment noting that a paid plausible.io account for the domain is required. Adds `class="plausible-event-name=Book+Click"` to 17 CTAs (nav-cta on every page, hero `btn-primary` buttons, mid-section persona CTAs, the `cta-bar` `btn-white` buttons). Form-submit button is intentionally not tagged so Plausible's own form-event capture handles conversions.
- **Conflict with current state**: No Plausible script anywhere on main — feature unshipped. The blocker per the worktree's own head comment is "requires plausible.io account with domain hiddengem.com registered (paid, $9/mo minimum)." Additionally, the script uses `data-domain="hiddengem.com"` but the canonical domain per `CLAUDE.md` and current JSON-LD is `hiddengemhealingutah.com`, so the data-domain attribute would need updating. CTA-tagging would also need to extend to Sam, Keira, and the mega-menu nav, since five new pages and a new nav structure landed after the worktree was created. Note also that adding any inline `<script>` tag is touched by the hourly bake (BeautifulSoup re-emits all HTML), so verify the bake's allow-list before merging.
- **Verify on main**: `grep -l plausible hidden-gem/*.html` returns nothing — unshipped.
- **If revisiting**: pull just the CTA-tagging strategy from the worktree's diff; re-derive the script tag against the canonical domain `hiddengemhealingutah.com`; manually walk through `index.html`, `about.html`, `abbey.html`, `sara-equine.html`, `sara-psychiatric.html`, `sam-pediatric.html`, `keira-aesthetics.html` and tag every CTA that points at `about.html#contact` or the equivalent on each persona page; verify the bake's BeautifulSoup pass preserves `class="plausible-event-name=Book+Click"` literal text (it should, but the `=`/`+` inside a class name is uncommon and worth a smoke test).
- **Recommendation**: **Revisit.** Useful work, blocked on a product decision and a corrected domain. Open question for the user: *do we want web analytics on this site, and is Plausible (paid, $9/mo) the right choice vs Netlify's built-in analytics or Plausible's free self-hosted option?* If yes to Plausible, this diff is the closest starting point — fix the `data-domain` to `hiddengemhealingutah.com`, extend tagging to Sam/Keira/the mega-menu nav-cta, and verify against the current site of seven pages.

### `agent-af321866fc05023f4` — appointment form UX (preferred contact, time, banner, hint)

- **Path**: `.claude/worktrees/agent-af321866fc05023f4`
- **Branch**: `worktree-agent-af321866fc05023f4`
- **Latest commit**: `27d508de6c4be02e1c2796e41e5574c3e41bebd9` — "Improve Hidden Gem appointment form UX" — Claude <noreply@anthropic.com> — 2026-05-18 00:08:37 +0000
- **Files changed in this branch's one commit**: 1 — `hidden-gem/about.html` (+37)
- **What it does**: Adds a `preferred_contact` radio group (Phone / Email / Either), a `preferred_time` select (No preference / Morning / Midday / Afternoon / Evening), a `pattern` attribute on the phone input requiring 10+ digits, a post-submit `role="status"` success banner driven by `?submitted=true`, and an italic hint under the message field warning patients not to include sensitive medical detail.
- **Conflict with current state**: All of it is shipped. Main commit `7aa2943` ("WIP: agent sprint partial integration (Plausible, testimonials, form polish, OTP functions)") and follow-ups merged the `preferred_contact`/`preferred_time`/`pattern`/inline-banner/hint additions. Current `about.html` has all five fields present, with the only meaningful additions on main being `id` attributes (for the WCAG `label for=` pairing) and minor styling.
- **Verify on main**: `grep -nE "preferred_contact|preferred_time|pattern=\"\\[" hidden-gem/about.html` returns matches around lines 312-336.
- **Recommendation**: **Retire.** Feature integrated. `git worktree remove .claude/worktrees/agent-af321866fc05023f4 && git branch -D worktree-agent-af321866fc05023f4`.

## 4. What about leakage into main?

`CLAUDE.md` warns that `isolation: "worktree"` does not sandbox file writes against absolute paths, so during the original sprint a sub-agent could have written into the main tree as well as its worktree. The integration commits on `main` that mention this sprint are:

- `7aa2943` — "WIP: agent sprint partial integration (Plausible, testimonials, form polish, OTP functions)"
- `259f0bb` — "Integrate agent 1: OTP-gated editor with Resend, hidden footer trigger"
- `b5b1e9e` — "Integrate agent 3: SEO <head> enrichment (og:image, Schema.org JSON-LD)"

The form-polish (af321866) and SEO (a16dbbd4) deltas track these integration commits closely, the testimonials and OTP-via-email integrations were later replaced (`b9f683d` and `5ac0cb7`), and the Plausible / thanks-page / pretty-URL / WCAG / elena@ outputs never made it into an integration commit. So the audit answer is: most of what's in these worktrees that resembles `main` got there via the explicit `WIP: agent sprint partial integration` commit, not via filesystem leakage. There is no detectable orphan content on `main` that came from a worktree without an integration commit. If you suspect otherwise on a specific file, `git log --all --diff-filter=A -- <path>` will surface the introducing commit.

## 5. Cleanup commands

The long-run intent for these worktrees is that they should not exist on a fresh checkout. `.claude/worktrees/` is gitignored at the repo root for a reason — a future sub-agent sprint will recreate identical-shaped directories under the same path, and stale leftovers from this sprint would mix with whatever is current. So the steady state is: once the three Revisit rows have been turned into a decision (either merged forward into a new commit or explicitly walked away from), all nine of these can be removed and the document remains as the record.

To retire ALL nine worktrees in one pass once the user has signed off, from the repo root:

```bash
for d in .claude/worktrees/agent-a09e24280ce23ab27 \
         .claude/worktrees/agent-a16dbbd43a1f618e2 \
         .claude/worktrees/agent-a2529dce82182c261 \
         .claude/worktrees/agent-a8efe3ca9dac0b7a5 \
         .claude/worktrees/agent-a941a7a530f73c719 \
         .claude/worktrees/agent-a95de8e2b787c29ab \
         .claude/worktrees/agent-abf0e03eec835ad6c \
         .claude/worktrees/agent-ae9023baec0fb33a1 \
         .claude/worktrees/agent-af321866fc05023f4; do
  git worktree remove --force "$d"
done

for b in worktree-agent-a09e24280ce23ab27 \
         worktree-agent-a16dbbd43a1f618e2 \
         worktree-agent-a2529dce82182c261 \
         worktree-agent-a8efe3ca9dac0b7a5 \
         worktree-agent-a941a7a530f73c719 \
         worktree-agent-a95de8e2b787c29ab \
         worktree-agent-abf0e03eec835ad6c \
         worktree-agent-ae9023baec0fb33a1 \
         worktree-agent-af321866fc05023f4; do
  git branch -D "$b"
done

git worktree prune
```

`--force` on `git worktree remove` is necessary because some worktrees have an untracked working tree (e.g., editor scratch state) that the harness would otherwise refuse to drop. `git worktree prune` cleans the `.git/worktrees/` administrative entries left behind. None of these branches are pushed to `origin` (verify with `git branch -r | grep worktree-agent`); if any are, `git push origin --delete <branch>` to clean the remote.

To retire only the unambiguous ones (the five "Retire" rows) and keep the three "Revisit" rows for follow-up discussion, the same loop with just those five paths and branch names.
