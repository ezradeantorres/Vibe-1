# Runbook

Operational reference for this repo: Netlify configuration, env vars, the bake workflow, and recovery procedures. Audience: a developer or AI agent with the repo cloned who needs to operate it.

For how the edit loop works under the hood, see `docs/architecture.md`. For design tokens and the component vocabulary, see `docs/content-model.md`. For parked agent worktrees and what to do with them, see `docs/worktree-inventory.md`. For past gotchas and "we tried X and it broke" stories, see `docs/troubleshooting.md`. For Elena's user-facing how-to, see `docs/editor-handbook.md`.

## 1. The two Netlify sites

This repo backs two independent Netlify sites that share `main` as their deploy branch:

| Site | Netlify Base directory | Netlify Publish directory | What it is |
|---|---|---|---|
| Hidden Gem (`hidden-gem-editable.netlify.app`) | `hidden-gem` | `.` (relative to base, i.e. `hidden-gem/`) | Elena's clinic site, public, indexable, has the in-browser editor |
| Senior-living apex | *(root)* | `public` | Compliance-scaffolded demo site (`noindex` site-wide). Placeholder only — pipeline not built. |

Both sites watch `main` and auto-publish on push. A push that touches only one site's directory still triggers builds on both, but each site only republishes when its own publish dir actually changes.

**Base + Publish settings live ONLY in the Netlify dashboard** — they are not in any committed file. The Hidden Gem `hidden-gem/netlify.toml` does set `publish = "."` and `functions = "netlify/functions"`, but those values are interpreted relative to whatever the dashboard has configured as Base directory; the file does not select the Base. The senior-living site has no `netlify.toml` at all. If the repo structure changes, the dashboard must follow or builds publish the wrong path silently — the deploy log will be green and the site will 404.

Verify or change at: Netlify dashboard → site → Site settings → Build & deploy → Build settings → Edit.

Site-specific committed config still in the repo:

- `hidden-gem/netlify.toml` — `node_bundler = "esbuild"` for functions, plus a pretty-URL redirect (`/:slug` → `/:slug.html`).
- `public/_headers` — site-wide `X-Robots-Tag: noindex,nofollow` for the senior-living placeholder.
- `public/robots.txt` — `Disallow: /` for the senior-living placeholder.

Do not put files for one site into the other's directory.

## 2. Env vars — by site

### Hidden Gem site

Set in Netlify dashboard → Hidden Gem site → Site settings → Environment variables. All are consumed at runtime by `hidden-gem/netlify/functions/*.mjs`.

| Var | Used in | Purpose | Default if unset |
|---|---|---|---|
| `EDITOR_PASSWORD` | `hidden-gem/netlify/functions/otp.mjs` | Single shared password gating editor login. POST to `/.netlify/functions/otp` with `{password}`; on match, mints a 32-hex token stored in the `site-otp` blob with a 4-hour TTL. | **Falls back to the literal string `'chloe'`** (see `FALLBACK_PASSWORD` in `otp.mjs`). Treat this var as the source of truth for who can edit the site. Rotate by setting this var to a new value. |
| `GH_BAKE_PAT` | `hidden-gem/netlify/functions/content.mjs` (`triggerBake`) | GitHub PAT used to POST `workflow_dispatch` on `bake-hidden-gem.yml` after every save/reset, so edits propagate to static HTML within ~60s instead of waiting for the hourly cron. Needs `repo` + `workflow` scopes (classic) OR a fine-grained token with `actions: write` on `ezradeantorres/Vibe-1`. | Silent no-op. Editor still works; bakes happen only on the hourly cron or manual dispatch. |
| `GH_OWNER` | `content.mjs` | Override GitHub owner for `triggerBake`. | `ezradeantorres` |
| `GH_REPO` | `content.mjs` | Override GitHub repo for `triggerBake`. | `Vibe-1` |
| `RESEND_API_KEY` | Email-OTP variant of `otp.mjs` (parked). | Used by the email-OTP flow that was replaced by password-only login because Resend's free tier requires a verified sender domain. Only needed if the email-OTP worktree gets merged. See `docs/worktree-inventory.md`. | Not consulted by the live `otp.mjs`. |
| `NETLIFY_AUTH_TOKEN` | The unbuilt senior-living `src/deploy.py`. | Reserved for future automated deploys. | Not currently required. |

### Senior-living site

No required env vars for the deployed placeholder. The `NETLIFY_AUTH_TOKEN` listed above is referenced by the senior-living pipeline only.

### GitHub Actions secrets

Set in repo → Settings → Secrets and variables → Actions.

`.github/workflows/bake-hidden-gem.yml` declares `permissions: contents: write` and commits/pushes via the implicit `GITHUB_TOKEN` provided to every Actions run. No custom secrets are referenced by the bake workflow itself. To verify:

```bash
grep -nE 'secrets\.' .github/workflows/bake-hidden-gem.yml
```

If that returns nothing, the workflow uses only `GITHUB_TOKEN`. The `GH_BAKE_PAT` discussed above lives in **Netlify** env vars, not GitHub secrets, because it's used by the Netlify Function to call the GitHub API — not by the workflow.

## 3. Netlify Forms — booking submissions

The Abbey-page booking form is a native Netlify Form. Submissions:

- Land in the **Forms** tab in the Hidden Gem Netlify dashboard.
- Trigger an **email notification** to the configured recipient.

**Recipient is configured in the Netlify dashboard ONLY** — it is not in any committed file. The repo has no `mailto:` configuration for form notifications; the dashboard owns it entirely.

Current state per `CLAUDE.md`: notifications go to `etorres@care.life` (testing). Target state once submissions are verified flowing: `elena@hiddengemhealingutah.com`.

Procedure to swap the recipient:

1. Netlify dashboard → Hidden Gem site.
2. Forms tab → pick the booking form.
3. Settings & usage → Form notifications.
4. Edit the email recipient → Save.

New submissions immediately use the new recipient; previously stored submissions are unaffected.

The visible `mailto:` link in HTML (`info@hiddengemhealingutah.com`) is a separate surface and lives in markup. Editing the dashboard recipient does not change the `mailto:` link, and vice versa. There are three independent surfaces for "where does email about the site go" — don't conflate them:

1. Visible `mailto:` links in HTML — code-controlled, change in markup.
2. Form notification recipient — Netlify dashboard only.
3. Service-sent email (OTP, future receipts) — Netlify Function code plus env vars like `RESEND_API_KEY`.

## 4. The hourly bake workflow

`.github/workflows/bake-hidden-gem.yml` pulls live overrides from Netlify Blobs (via the site's own `/.netlify/functions/content` endpoint), runs `scripts/bake_hidden_gem_edits.py`, and commits the rebaked HTML under `hidden-gem/`.

Triggers:

- `schedule: cron: '0 * * * *'` — every hour on the hour (UTC). No-op commit if there are no new edits.
- `workflow_dispatch` — manual trigger from the Actions tab.
- Programmatic dispatch from `content.mjs:triggerBake`, which calls the same `workflow_dispatch` API endpoint (`POST /repos/.../actions/workflows/bake-hidden-gem.yml/dispatches`) on every save and reset. With `GH_BAKE_PAT` configured, saves bake within ~60s rather than waiting for the cron. Without the PAT, the call is a silent no-op.

Concurrency:

```yaml
concurrency:
  group: bake-hidden-gem
  cancel-in-progress: true
```

A new dispatch supersedes any in-flight bake. With auto-trigger on every save, queued bakes would otherwise stack up; we always want the freshest blob snapshot.

What the job does:

1. `actions/checkout@v4`.
2. `actions/setup-python@v5` with Python 3.12 and pip cache.
3. `pip install requests beautifulsoup4`.
4. `python scripts/bake_hidden_gem_edits.py` — pulls overrides from the live content endpoint and patches static HTML under `hidden-gem/`.
5. Stages `hidden-gem/`. If `git diff --staged --quiet` is true, exits cleanly with `No new edits to bake.` Otherwise commits as `github-actions[bot]` with message `Bake Hidden Gem edits from Netlify Blobs` and pushes to `main`.

### How to manually run a bake

Use when the hourly run looks stuck, blob → HTML drift is suspected, or you want to force a publish without an edit.

1. Repo → Actions tab → **Bake Hidden Gem edits** workflow.
2. Click **Run workflow** → Branch: `main` → **Run workflow**.
3. Watch the run. If it commits anything, Netlify auto-deploys within ~30s of the push to `main`.

From a shell with `gh` authenticated:

```bash
gh workflow run bake-hidden-gem.yml --ref main
gh run watch
```

### How to run the bake locally

If you need to debug bake output without pushing:

```bash
pip install requests beautifulsoup4
python scripts/bake_hidden_gem_edits.py
git diff hidden-gem/
```

This hits the live `/.netlify/functions/content` endpoint, so the operator's machine must have egress to `hidden-gem-editable.netlify.app`. See section 7.

## 5. Netlify CLI quick reference

Install and authenticate once per machine:

```bash
npm i -g netlify-cli
netlify login
```

The CLI links one directory to one Netlify site at a time via `.netlify/state.json`. To work with both sites, link them separately:

```bash
# Senior-living site (linked from repo root)
cd /home/user/Vibe-1
netlify link

# Hidden Gem site (linked from hidden-gem/)
cd /home/user/Vibe-1/hidden-gem
netlify link
```

Choose by site name (`hidden-gem-editable` for the Hidden Gem one). From a linked directory:

```bash
netlify status                  # which site is this dir linked to?
netlify env:list                # env vars for the linked site
netlify env:set EDITOR_PASSWORD <value>
netlify env:unset EDITOR_PASSWORD
netlify functions:list          # list deployed functions
netlify functions:invoke otp    # invoke a function locally for testing
netlify logs:function content   # tail logs for a specific function
netlify logs:function otp
netlify dev                     # spin up local server with functions
netlify deploy --build          # build + draft deploy preview (non-prod URL)
netlify deploy --build --prod   # build + production deploy. Rare — main autopublishes.
netlify open                    # open the linked site's dashboard in browser
```

## 6. Recovery procedures

### Symptom: Hidden Gem site is 404ing everywhere after a deploy

Cause: Almost certainly the Netlify dashboard's Base/Publish dirs got desynced from the repo layout. This happened during the PR #3 multi-project restructure when files moved into `hidden-gem/` but the dashboard still pointed at the old paths. The build still completes green because there's no `[build]` block to fail; it just publishes the wrong directory.

Fix:

1. Netlify dashboard → Hidden Gem site → Site settings → Build & deploy → Build settings.
2. Confirm **Base directory** = `hidden-gem` and **Publish directory** = `.` (relative to base, so the published dir is `hidden-gem/`).
3. Trigger a new deploy: Deploys tab → **Trigger deploy** → **Clear cache and deploy site**.
4. Once green, hit `https://hidden-gem-editable.netlify.app/` and any subpage (e.g. `/about`) to confirm.

### Symptom: An edit was saved in the browser but doesn't appear on the live site even after an hour

Walk the cause hierarchy in this order; stop at the first hit.

1. **The save POST silently failed.** Check Netlify Functions logs for `content`:

   ```bash
   netlify logs:function content
   ```

   Look for non-200 responses or thrown errors around the save time. Common cause: token expired (4-hour TTL) and the editor didn't re-prompt; user should log out and back in.
2. **`triggerBake` fired but `GH_BAKE_PAT` is expired or wrong scope.** Repo → Actions tab → check whether any workflow run was queued within ~30s of the save. If nothing queued, the dispatch never reached GitHub. The `content` function logs will show `triggerBake failed <status> <detail>`. Rotate the PAT and update `GH_BAKE_PAT` in Netlify env vars.
3. **The bake ran but the override didn't land in HTML.** Actions tab → open the run → check the **Run bake script** step output and the **Commit and push if changed** step. If the bake committed but the field still looks unchanged, look for `no match in current DOM; skipping` lines — that means the JS-side and Python-side content hashes disagreed (selector drift between `hidden-gem/js/editor.js` `EDITABLE_SELECTOR` / `EXT_EDITABLE_SELECTOR` and `scripts/bake_hidden_gem_edits.py` `EDITABLE_SELECTORS` / `EXT_EDITABLE_SELECTORS`, or a whitespace difference between the browser's `textContent` and BeautifulSoup's `get_text()`). The bake never errors on a miss; it just leaves the static HTML alone. See `docs/troubleshooting.md` for the full diagnosis.
4. **Bake committed but Netlify is auto-pausing deploys.** Netlify Deploys tab → look for **Auto publishing is off** or a **Locked to current deploy** banner. Toggle off / unlock, then trigger a deploy.

While investigating, run a manual `workflow_dispatch` (section 4) to force a fresh bake — it isolates whether the bake itself works.

### Symptom: Booking form submissions aren't generating email notifications

Cause: Recipient is misconfigured in the Netlify dashboard (the only place this can be set). The repo can't help here — there is no committed configuration to inspect.

Fix: See section 3.

Also verify in Netlify dashboard → Hidden Gem site → Forms that submissions are actually arriving. If submissions aren't landing at all (not just missing emails), the form's `data-netlify="true"` attribute or hidden `form-name` input may have been edited out of the HTML — restore them in markup.

### Symptom: OTP login fails for an expected editor

Walk this hierarchy in order.

1. **`EDITOR_PASSWORD` was changed without telling them.** Netlify dashboard → Environment variables → confirm current value. Remember: if the var is unset entirely, the password defaults to `'chloe'` (see `hidden-gem/netlify/functions/otp.mjs:FALLBACK_PASSWORD`). Setting it to an empty string is not the same as unsetting it.
2. **`otp.mjs` is erroring at runtime.** Netlify dashboard → Functions → `otp` → Logs, or:

   ```bash
   netlify logs:function otp
   ```

   Look for 500s or thrown errors. A 500 here usually means the `@netlify/blobs` `getStore('site-otp')` call failed — typically a Blobs configuration issue at the site level. Redeploy or open a Netlify support ticket.
3. **Browser has stale session state.** Have the editor open DevTools → Application → Local Storage → clear entries for `hidden-gem-editable.netlify.app`, then reload and re-enter the password.
4. **Token expired mid-session.** Tokens have a 4-hour TTL (`TOKEN_TTL_MS = 4 * 60 * 60 * 1000` in both `otp.mjs` and `content.mjs`). After expiry, saves return 401 and the editor should re-prompt; if it doesn't, log out and back in.

### Symptom: A pre-existing edit silently reverts after the next bake

Cause: The blob entry was deleted — either via the editor's reset-field UI or by a `DELETE` on `/.netlify/functions/content`. The bake then has no override to apply, so the HTML reverts to the committed default.

Fix: Netlify dashboard → Functions → `content` → Logs. Look for `DELETE` requests around the time of the revert. If the deletion was intentional but unexpected, re-edit the field in the editor; the new save will trigger a fresh bake.

### Symptom: Bake commits are reformatting unrelated HTML and producing rebase conflicts

Cause: The bake script uses BeautifulSoup, which requotes attributes, self-closes tags, and reshuffles whitespace. If you have staged HTML changes when the hourly cron fires, a subsequent `git pull --rebase` can produce conflicts on every page.

Mitigation:

- Do non-trivial HTML edits on a feature branch and merge deliberately into `main`.
- Or batch changes into the ~30-minute window right after a bake commit lands.

See `docs/troubleshooting.md` for the full story.

## 7. Sandbox / Claude Code on the web — egress reality

Claude Code on the web runs behind an **environment-level network firewall** that returns `x-deny-reason: host_not_allowed` for any host outside the chosen network policy. Any tool inside the session — `curl`, `WebFetch`, Python `requests`, the Playwright browser — will be blocked at that layer.

This is **separate from** `.claude/settings.json`'s `sandbox.network.allowedDomains`, which only governs what Claude is permitted to call within the harness. Adding a domain there does **not** punch through the platform firewall. The entry for `hidden-gem-editable.netlify.app` in this repo's settings is real, but the platform still blocks the host.

Consequences for ops work:

- You cannot `curl https://hidden-gem-editable.netlify.app/...` from inside a Claude Code web session unless the environment's network policy allows that host.
- You cannot run `scripts/bake_hidden_gem_edits.py` against the production blob from inside the session for the same reason — it hits `hidden-gem-editable.netlify.app/.netlify/functions/content`.
- `WebFetch` against the live site returns the same `host_not_allowed`.

To actually reach the live site from a Claude Code web session, the environment's network policy must be widened **at environment-creation time** in the Claude Code web app, and a new session started from that environment. The current session cannot bypass it.

The hourly bake via GitHub Actions runs on GitHub-hosted runners with unrestricted egress, which is why the bake works there even though the sandbox cannot. When in doubt, use the Actions tab manual dispatch (section 4) instead of trying to run the bake locally from the sandbox.
