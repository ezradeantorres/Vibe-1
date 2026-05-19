# Troubleshooting

This is the consolidated bug log. Each entry has **Symptom** / **Cause** / **Fix** (and **Prevention** where useful). If you hit something that's not here, write it up after you fix it. Audience: a developer or AI agent debugging a problem in this repo at 11pm on Friday.

For broader context see `docs/architecture.md`, `docs/runbook.md` (Netlify dashboard settings), `docs/worktree-inventory.md` (parked worktrees), `docs/content-model.md` (component vocabulary), and `docs/editor-handbook.md` (operator instructions).

## Index

| Symptom | Entry | Severity |
|---|---|---|
| Sub-agent edits show up in main tree | [Sub-agent worktree isolation gaps](#sub-agent-worktree-isolation-doesnt-sandbox-absolute-paths) | High |
| Netlify build fails with "submodule not found" | [Worktree dirs captured as gitlinks](#claudeworktrees-must-be-gitignored-before-spawning-sub-agents) | High |
| Multiple Edit calls error "file modified since read" | [Parallel Edits collide](#parallel-edit-calls-to-the-same-file-collide) | Low |
| Rebase conflicts on every HTML file after the hour rolls | [Hourly bake pre-empts push](#the-hourly-bake-action-will-pre-empt-your-push) | High |
| Build succeeds but every page 404s | [Dashboard Base/Publish desynced](#netlify-dashboard-config-that-lives-outside-the-repo-can-desync-silently) | High |
| Form notification still going to wrong recipient after code change | [Email surfaces conflated](#form-notification-recipient-is-dashboard-only) | Med |
| Edits save but never appear on the static site after bake | [EDITABLE_SELECTOR drift](#editor--bake-editable_selector-drift-silently-corrupts-content) | High |
| `:ext:` namespace keys aren't being baked | [`:ext:` historically skipped](#ext-namespace-was-historically-skipped-by-the-bake) | Med |
| Legitimate `<div>` or other tags stripped from saved content | [Allowlist sanitizer scope](#editor-and-bake-treat-stored-content-as-raw-html) | Med |
| "Site stuck on old deploy" | [Misdiagnosed as locked deploy](#locked-deploy-framing-is-a-common-misdiagnosis) | Med |
| Netlify function or live URL unreachable from Claude session | [Sandbox egress firewall](#sandbox-level-egress-firewall-blocks-netlifyapp-from-inside-claude-code-on-the-web) | Med |
| Editor password mystery | [`EDITOR_PASSWORD` default is `chloe`](#editor_password-env-var-defaults-to-chloe-if-unset) | Med |
| `src/audit.py` does not exist | [`src/` is mostly empty](#the-src-directory-is-mostly-empty) | Low |
| Netlify build can't find a file by absolute path | [`netlify.toml` paths are relative to base dir](#hidden-gemnetlifytoml-paths-are-relative-to-the-hidden-gem-base-dir-not-the-repo-root) | Med |
| `sam-pediatric.html` / `keira-aesthetics.html` look empty | [Intentional coming-soon stubs](#coming-soon-provider-pages-are-intentional-stubs) | Low |
| Editor highlight visible on live site | [Bake sanitizer bypass for legacy namespace](#bake-sanitizer-bypass-leaked-editor-chrome-into-production-html) | High |
| Editor edits overlay onto wrong DOM nodes | [Positional index drift in blob keys](#positional-blob-keys-drift-when-static-html-changes) | High |
| `POST /` returns 404 from the booking form | [Netlify Forms not registered](#booking-form-posts-return-404-form-never-registered) | High |
| Soft-404 redirect catches valid POST flows | [Catch-all 404 rewrite](#catch-all-404-rewrite-mis-fires-on-valid-post-flows) | Med |
| Misspelled "Kiera" surfaces in URLs/content | [Correct spelling is Keira](#correct-provider-spelling-is-keira-not-kiera) | Low |
| Sitemap host mismatch flagged in Search Console | [`robots.txt` sitemap pointer had `www.`](#robotstxt-sitemap-pointer-must-match-canonical-domain) | Low |

---

## Sub-agent worktree isolation doesn't sandbox absolute paths

**Symptom.** A sub-agent invoked with `isolation: "worktree"` produces edits that show up in the main repo tree. `git status` between consecutive tool calls becomes unreliable. Two sub-agents racing on the same file overwrite each other.

**Cause.** `isolation: "worktree"` creates a real isolated git worktree but does **not** sandbox file writes. When a prompt or tool call references absolute paths like `/home/user/Vibe-1/hidden-gem/...`, the sub-agent's `Edit` or `Write` lands in the main tree (because that's the literal path you gave it), not the worktree.

**Fix.** Brief sub-agents to use paths **relative to their worktree CWD**, never absolute. If main-tree contamination already happened, diff against `main` and reset whatever shouldn't be there before doing anything else.

**Prevention.** When writing sub-agent prompts, always say "use paths relative to your worktree" and avoid pasting absolute paths into the prompt text. Don't trust `git diff` / `git status` to be consistent across tool calls while sub-agents are running in the background.

---

## `.claude/worktrees/` must be gitignored before spawning sub-agents

**Symptom.** Netlify build fails with a confusing "submodule not found" error referencing `.claude/worktrees/<something>`. Locally, `git status` shows worktree directories as mode-160000 gitlinks.

**Cause.** Sub-agent worktrees live under `.claude/worktrees/`. If that path isn't in `.gitignore` before the agent runs, a subsequent `git add -A` (or any commit that picks up new untracked entries) captures each worktree as a mode-160000 gitlink. Netlify clones the repo, hits the gitlinks, tries to fetch the referenced "submodules", finds nothing, and aborts the build.

**Fix.** Ensure `.claude/worktrees/` is in `.gitignore` (already is — verify before spawning agents):

```bash
grep -n "worktrees" .gitignore
```

If gitlinks already landed, remove them:

```bash
git rm --cached .claude/worktrees/<dir>
```

**Prevention.** Don't run `git add -A` while sub-agents are active. Stage explicitly with named paths.

---

## Parallel `Edit` calls to the same file collide

**Symptom.** Batching two or more `Edit` calls to the same file in a single assistant message: the first applies, the rest error with `file modified since read`.

**Cause.** The Edit tool reads a file, computes the diff, then writes. When several Edits target the same file in parallel, they all read the same baseline, but only one write wins; the others detect the mismatch and abort.

**Fix.** Either sequence the edits across separate assistant messages, or replace the batch with a single `Write` call carrying the full new file contents.

**Prevention.** When planning a batch of edits, group by file. If a file gets more than one change, use Write for that file or sequence the Edits.

---

## The hourly bake action will pre-empt your push

**Symptom.** You have uncommitted (or unpushed) HTML changes on `main`. The clock rolls past the hour. Your next `git pull --rebase` produces conflicts on every editable HTML file: attributes requoted, tags self-closed, whitespace shuffled — totally unsalvageable diffs.

**Cause.** `.github/workflows/bake-hidden-gem.yml` runs on `cron: 0 * * * *`. It pulls Netlify Blob overrides, applies them via BeautifulSoup, and commits the result back to `main`. BeautifulSoup reformats every HTML file it touches, even when no semantic content changes.

**Fix (after the conflict).** Don't try to rebase. Either:
- Stash your work, reset to the bake's commit, and reapply by hand on a fresh feature branch, or
- Open a feature branch from before the bake commit and reapply your work there, then merge.

**Prevention.** Two safe patterns:
- Do non-trivial HTML edits on a feature branch and merge deliberately into `main`.
- Or batch changes into the ~30-minute window right after a bake commit lands.

---

## Netlify dashboard config that lives outside the repo can desync silently

**Symptom.** Builds succeed in the Netlify deploy log but the deployed site 404s on every page, including the root. No clue in the build logs.

**Cause.** Netlify's **Base directory** and **Publish directory** are dashboard-only settings. When the repo layout changed (e.g. PR #3 restructured into `hidden-gem/`), the dashboard's Base directory still pointed at the repo root. The build "succeeded" because there's no `[build]` block to fail, but it published the wrong path — the contents of the root, not `hidden-gem/`.

**Fix.** In the Netlify dashboard, go to Site configuration → Build & deploy → and verify Base directory is `hidden-gem` (for the Hidden Gem site) and Publish directory is `.` (relative to the base). See `docs/runbook.md` for the full per-site settings table.

**Prevention.** Any time you move directories in the repo, immediately verify Base + Publish in the dashboard for both Netlify sites. Don't assume the build log will tell you when it's wrong.

---

## Form notification recipient is dashboard-only

**Symptom.** You change a `mailto:` link in the HTML to `elena@hiddengemhealingutah.com` and deploy. Form submissions keep going to `etorres@care.life`.

**Cause.** "Where does email Z get sent" has at least four distinct surfaces and they don't share configuration:

1. Visible `mailto:` link in HTML (code change).
2. Netlify Form notification recipient (Netlify dashboard only — Forms → notifications → recipient).
3. Service-sent email like OTP / receipts (Netlify Function + Resend / SendGrid env var).
4. Some combination.

Editing the `mailto:` link only touches surface 1.

**Fix.** Identify which surface you mean before editing:
- To redirect Netlify Form notifications, edit in the Netlify dashboard, not the repo.
- To redirect OTP delivery, edit the Netlify Function or its env vars.
- To redirect a visible `mailto:`, edit HTML.

See `docs/runbook.md` for the current recipient on each surface.

**Prevention.** When the ask is "send X to Y", restate which surface you intend to change before touching anything.

---

## Editor / bake EDITABLE_SELECTOR drift silently corrupts content

**Symptom.** Operators edit a paragraph in the in-page editor, save, see the change live (overlay), but after the hourly bake the edit silently disappears — or worse, lands on the wrong DOM node.

**Cause.** `hidden-gem/js/editor.js` defines `EDITABLE_SELECTOR` and `EXT_EDITABLE_SELECTOR`. `scripts/bake_hidden_gem_edits.py` defines `EDITABLE_SELECTORS` and `EXT_EDITABLE_SELECTORS`. Each side iterates the selector and assigns a key. If the two selectors diverge — even by one CSS class — the editor and bake see different sets of elements, keys drift, and the bake applies an override onto the wrong node (or skips it). Since the key system now uses content-addressed DJB2 hashes (see commit `1722b2c`), drift doesn't error — it just silently doesn't apply.

**Fix.** When changing either selector, change both in the same commit. Compare:

```bash
grep -n "EDITABLE_SELECTOR\|EDITABLE_SELECTORS" hidden-gem/js/editor.js scripts/bake_hidden_gem_edits.py
```

The JS side lives in `hidden-gem/js/editor.js` around line 33 (`EDITABLE_SELECTOR`) and line 45 (`EXT_EDITABLE_SELECTOR`). The Python side lives in `scripts/bake_hidden_gem_edits.py` around line 46 (`EDITABLE_SELECTORS`) and line 57 (`EXT_EDITABLE_SELECTORS`).

**Prevention.** Treat the selector lists as one logical unit. Add a test if you have one. Never edit one without the other.

---

## `:ext:` namespace was historically skipped by the bake

**Symptom.** Edits to elements matched by `EXT_EDITABLE_SELECTOR` (e.g. `.ps-eyebrow`) survive as live overlay but vanish after the next bake. The static HTML on disk never picks them up.

**Cause.** An earlier version of `scripts/bake_hidden_gem_edits.py` only handled the legacy `${page}:${idx}` key namespace and ignored the `${page}:ext:${idx}` namespace. Commit `8893304` added `collect_ext_text_nodes()` and ext-namespace handling, but the gotcha is worth verifying before relying on it.

**Fix.** Confirm the bake script handles ext keys before adding a new selector to `EXT_EDITABLE_SELECTOR`:

```bash
grep -n "ext" scripts/bake_hidden_gem_edits.py
```

Look for both `collect_ext_text_nodes` and `:ext:` routing inside `apply_overrides`.

**Prevention.** When adding a new editable class, exercise it end-to-end: edit, save, manually trigger a bake (or wait for the hourly), confirm the value lands in the static HTML.

---

## Editor and bake treat stored content as raw HTML

**Symptom (was).** A malicious or buggy POST to `/.netlify/functions/content` could write arbitrary HTML to a Netlify Blob, which would then be injected verbatim into the live site (via `el.innerHTML`) and into the static HTML on the next bake. `innerHTML` does not execute `<script>` but does fire `<img onerror>`, `<svg onload>`, `javascript:` href clicks, etc.

**Symptom (now).** An editor who pastes content containing tags outside the allowlist (e.g. `<div>`, `<table>`, `<h1>` inside a paragraph) sees the tags silently unwrapped on save. Text content survives; markup is discarded.

**Cause.** Editor and bake both treat stored content as HTML:
- `hidden-gem/js/editor.js` does `el.innerHTML = sanitizeOverrideHTML(data[key])` on every page load.
- `scripts/bake_hidden_gem_edits.py` parses values via `sanitize_override_html()` + BeautifulSoup and appends children into the DOM (`apply_overrides`).

The trust boundary is whoever holds the `EDITOR_PASSWORD` (default `chloe`, see [`EDITOR_PASSWORD` defaults](#editor_password-env-var-defaults-to-chloe-if-unset)) and can therefore mint a token via `/.netlify/functions/otp`. Anyone with a token can POST persistent content.

**Fix.** Both sanitizers run an allowlist over every node before render. Allowed tags: `a, b, br, blockquote, em, i, li, ol, p, span, strong, u, ul`. Allowed attributes: `href` on `<a>` only, and only when the URL scheme is `http(s):`, `mailto:`, `tel:`, or relative (no `javascript:`, `data:`, `vbscript:`). Everything else gets unwrapped (text preserved) or — for `<script>`, `<style>`, `<iframe>`, `<svg>`, `<form>`, media tags, etc. — decomposed (content discarded). This is in addition to the editor-chrome stripping (`contenteditable`, `hg-editable`, `data-edit-key`, `data-start`/`data-end`, empty `<p>`s, the `pointer-events-none` cruft divs, inline `background-color`). The JS sanitizer is at `hidden-gem/js/editor.js:143` and the Python mirror is at `scripts/bake_hidden_gem_edits.py:64`; they MUST produce identical output for identical input.

**Prevention.** Treat the password as the trust boundary. Rotate `EDITOR_PASSWORD` via the dashboard env var if it leaks. The current sanitizer is conservative and may strip legitimate HTML if a future editor feature wants to allow, say, `<div>` or `<img>` inside text content — in that case widen the allowlist in BOTH sanitizers together and add a test case for the new tag. Server-side sanitization in `content.mjs` is still not implemented; the storage layer accepts whatever the client POSTs and relies on the two-sided render sanitizer. Adding server-side write sanitization would be a defense-in-depth win.

---

## "Locked deploy" framing is a common misdiagnosis

**Symptom.** The live site appears stuck on a deploy from weeks or months ago. Operator concludes Netlify's "Lock to current deploy" is on.

**Cause.** Almost certainly not. The two times this came up, the real cause was a missing or stale **Base directory** in the dashboard after a repo restructure. The deploy log shows "success" but the wrong files get published.

**Fix.** Before assuming the deploy is locked:
1. Open the Netlify dashboard for the site.
2. Check Site overview → "Auto publishing is on/off" — confirm it's on.
3. Check the most recent deploy's status and inspect what was actually published.
4. Verify Base + Publish directories match what the repo expects (see [dashboard desync](#netlify-dashboard-config-that-lives-outside-the-repo-can-desync-silently)).

**Prevention.** Trust the deploy log only after confirming the dashboard build settings match the current repo layout.

---

## Sandbox-level egress firewall blocks `*.netlify.app` from inside Claude Code on the web

**Symptom.** From a Claude Code web session: `curl` / WebFetch / `bake_hidden_gem_edits.py` against `*.netlify.app` fails with `x-deny-reason: host_not_allowed`. The same URL works fine from the user's laptop.

**Cause.** Two layers of network control, only one of which the repo controls:

- `.claude/settings.json` `sandbox.network.allowedDomains` governs what Claude inside the session is permitted to call. This repo lists `hidden-gem-editable.netlify.app`.
- The Claude Code platform itself has an environment-wide egress firewall, set at environment-creation time in the Claude Code web app. This is **separate** and overrides nothing — but blocks everything not on its allowlist.

The platform firewall trumps the in-session allowlist. A domain in `.claude/settings.json` that isn't also in the environment's network policy still gets blocked.

**Fix.** To reach `*.netlify.app` from a session, the **environment's network policy** must be widened in the Claude Code web app, and a new session started from that environment. You cannot bypass this inside a running session.

**Prevention.** When asked to "test the live site" from inside Claude Code, surface this constraint immediately rather than spending a turn discovering it. The hourly bake works because it runs on GitHub Actions runners, which have unrestricted egress.

---

## `EDITOR_PASSWORD` env var defaults to `chloe` if unset

**Symptom.** Operator visits the editor, prompted for a password, types something they remember setting, gets rejected. Or: nobody can recall what the password is.

**Cause.** `hidden-gem/netlify/functions/otp.mjs` reads `process.env.EDITOR_PASSWORD` and falls back to the hardcoded string `'chloe'` (constant `FALLBACK_PASSWORD`, line 21) if the env var isn't set in the Netlify dashboard.

**Fix.** Either:
- Set `EDITOR_PASSWORD` in the Netlify dashboard (Site configuration → Environment variables) and trigger a redeploy.
- Or temporarily use the fallback `chloe` to confirm access, then rotate.

**Prevention.** If you change the password in the dashboard, communicate the new value to operators out-of-band (not via this repo). Don't paste the password into commits or PR descriptions.

---

## The `src/` directory is mostly empty

**Symptom.** Agent (or human) tries to read `src/audit.py`, `src/scrape.py`, `src/generate.py`, `src/deploy.py`, or `src/lib/llm.py`. None exist.

**Cause.** `PROJECT_PLAN.md` describes a senior-living pipeline whose Python modules live under `src/`, but Phase 1 hasn't actually built them. The only real Python in this repo is `scripts/bake_hidden_gem_edits.py`. `src/__init__.py` and `src/lib/__init__.py` exist as empty placeholders.

**Fix.** Don't waste time grepping for the senior-living scripts. If you need to actually run the pipeline, those modules need to be written first (per Appendix A of `PROJECT_PLAN.md`).

**Prevention.** When picking up the repo: `ls src/ src/lib/` first to see what's actually there.

---

## `hidden-gem/netlify.toml` paths are relative to the Hidden Gem base dir, not the repo root

**Symptom.** A redirect rule, function path, or headers entry in `hidden-gem/netlify.toml` "works locally" but Netlify's build fails or silently no-ops the rule.

**Cause.** Netlify is configured (in the dashboard) with **Base directory = `hidden-gem`** for the Hidden Gem site. Every path inside `hidden-gem/netlify.toml` is interpreted relative to that base, not relative to the repo root or any absolute path. Writing `/home/user/Vibe-1/hidden-gem/...` or `/hidden-gem/...` won't resolve to a real path on the build host.

**Fix.** Use base-relative paths inside the toml: `netlify/functions/<name>.mjs`, `images/<file>`, etc. Never repo-root paths, never absolute paths.

**Prevention.** Before editing `netlify.toml`, remind yourself that "the base directory is `hidden-gem/`" and write paths as if you were standing inside that directory.

---

## Coming-soon provider pages are intentional stubs

**Symptom.** `hidden-gem/sam-pediatric.html` and `hidden-gem/keira-aesthetics.html` look much shorter / emptier than `sara-psychiatric.html` or `abbey.html`.

**Cause.** Sam and Keira (note: Keira, not Kiera — see [correct spelling](#correct-provider-spelling-is-keira-not-kiera)) are upcoming providers without finalized copy. The pages exist so the nav menu has live targets and the canonical URLs / sitemap entries are stable. The bodies are intentionally minimal.

**Fix.** Don't "fix" the missing content by writing placeholder copy. Ask the user before substantively expanding either page.

**Prevention.** When a page looks empty, check git history and `docs/content-model.md` before treating it as a bug.

---

## Bake sanitizer bypass leaked editor chrome into production HTML

**Symptom.** Anonymous visitors to `sara-equine.html` (and similar) see dashed borders, cream-yellow editable highlights, and duplicated paragraph copy inside list items and CTA buttons. The editor "chrome" is visible on the live, signed-out site.

**Cause.** `scripts/bake_hidden_gem_edits.py:apply_overrides()` correctly wrapped blob values in `sanitize_override_html()` in the ext-namespace branch but **not** in the legacy text-namespace branch. Every hourly bake therefore wrote raw blob HTML — including `contenteditable="true"`, `class="hg-editable"`, `data-edit-key`, `data-start/data-end` markers — straight into the static HTML for keys like `sara-equine:2`, `sara-equine:10`. See commit `584f5a2`.

**Fix.** Wrap **both** branches in `sanitize_override_html(val)`. Add `_unwrap_self_nested(target)` to flatten cases where the bake appended a `<p>` inside a `<p>`. Have the operator click "Reset page" once on affected pages while signed in, to clear historical corrupt blob entries.

**Prevention.** Any code path that writes blob content into the live DOM or static HTML must go through the same sanitizer. If you add a third branch, sanitize it.

---

## Positional blob keys drift when static HTML changes

**Symptom.** Long paragraphs of body copy appear inside `.cred` pills. Section labels read "EDIT" or some other unrelated copy. Operator hasn't edited those nodes recently — old edits are showing up on different elements than originally targeted.

**Cause.** The historical blob key scheme was positional: `sara-equine:8`, `home:ext:5`, etc. Any static-HTML edit that added or removed an editable element shifted the indices, so old blob values overlaid onto the wrong DOM nodes.

**Fix.** Commit `1722b2c` moved keys to content-addressable DJB2 hashes (`${pageKey}:h${hash}`). The bake skips hash entries that don't match any current element, so drift is invisible instead of corrupting. For pages still showing residual corruption from legacy positional entries, the operator should click "Reset page" once while signed into the editor — that wipes the old positional entries from the blob entirely.

**Prevention.** Don't reintroduce positional keys. If you change the hash function, mirror the change in both `editor.js` (`hgHashContent`) and `bake_hidden_gem_edits.py` (`hg_hash_content`) in the same commit. They must produce byte-identical output for the same input.

---

## Booking form POSTs return 404; form never registered

**Symptom.** Submitting the appointment form on `/about` returns 404 instead of Netlify's expected 200/303. Errors like "submit failed: 404" surface in the AJAX path; the redirect path also can't fire because the 404 happens first.

**Cause.** Netlify's build-time HTML scanner failed to register the `appointment` form even though `about.html` had all the right scaffolding (`data-netlify="true"`, hidden `form-name` input, honeypot wired). With no registration, Netlify Forms rejects every POST as 404. See commit `2073083`.

**Fix.** Add a hidden form stub in a top-level HTML file (`index.html`) so the build-time scanner is guaranteed to find it:

```html
<form name="appointment" data-netlify="true" hidden aria-hidden="true">
  <!-- mirror the real form's input names -->
</form>
```

The stub doesn't render to users (`hidden` + `aria-hidden`) but Netlify's scanner registers the form.

**Prevention.** When adding a new Netlify Form, put a hidden stub in `index.html` immediately. Don't rely on the scanner finding the real form on a deeper page.

---

## Catch-all 404 rewrite mis-fires on valid POST flows

**Symptom.** Form-submission flows and certain valid POST → 303 sequences return 404 unexpectedly. `/thanks.html` returns 404. Behavior is intermittent and the redirect rule looks correct on paper.

**Cause.** A previous `netlify.toml` rule:

```toml
[[redirects]]
from = "/*"
to = "/index.html"
status = 404
force = false
```

With `force = false` this should only fire on missing paths, but Netlify's interaction with form-submission redirects appears to mis-trigger it for valid POST → 303 flows. See commit `fe4b217`.

**Fix.** Drop the catch-all 404 rule. Replace with:
- A pass-through for `/.netlify/*` so functions never get rewritten.
- A pretty-URL rewrite (`/:slug` → `/:slug.html`, `status = 200`, `force = false`) so `/about`, `/abbey`, `/thanks` work without `.html`.

**Prevention.** Avoid catch-all 404 rewrites in `netlify.toml`. If you need a real 404 page, use Netlify's default behavior or a `404.html` file at the publish root.

---

## Correct provider spelling is Keira, not Kiera

**Symptom.** Mixed spellings of "Keira" / "Kiera" across nav links, file names, image filenames, and body copy. Old URL `/kiera-aesthetics` 404s after a rename.

**Cause.** An earlier session used Kiera (K-i-e-r-a) based on an interim user answer. The correct spelling is Keira (K-e-i-r-a). See commit `034146b`.

**Fix.** File and image renames are done. If inbound links to `/kiera-aesthetics` need to keep working, add to `hidden-gem/netlify.toml`:

```toml
[[redirects]]
from = "/kiera-aesthetics"
to = "/keira-aesthetics"
status = 301
```

Currently skipped because there are no real inbound links yet.

**Prevention.** When a name's spelling is at all ambiguous, confirm with the user once and grep-search the repo before committing.

---

## `robots.txt` sitemap pointer must match canonical domain

**Symptom.** Google Search Console flags the sitemap as belonging to a different property than the rest of the site. Search Console treats `www.` and bare-domain as separate properties.

**Cause.** `hidden-gem/robots.txt` had a `Sitemap:` line pointing at `https://www.hiddengemhealingutah.com/sitemap.xml`, but the canonical domain throughout the site (canonical tags, JSON-LD `url`, `og:image`) is the bare `https://hiddengemhealingutah.com/`. See commits `fd0dc38` and `7c68494`.

**Fix.** Make the `Sitemap:` line in `robots.txt` match the canonical domain (bare, no `www.`). Same applies to every canonical-style reference in HTML head tags.

**Prevention.** Whenever you change canonical domain anywhere, grep for the other instances:

```bash
grep -rn "hiddengemhealingutah" hidden-gem/ | grep -v ".git"
```

Update them all in one commit.
