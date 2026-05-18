# Hidden Gem Healing — Editable Site

This folder is a copy of the main site plus an in-page editor. The editor
is gated by an **email one-time-passcode (OTP)** flow: only the
hard-coded whitelist of email addresses in
`netlify/functions/otp.mjs` can sign in. Everyone else just sees the
public site — the "edit" link is visible but they cannot complete the
OTP, so they cannot actually edit.

To edit, an authorized user clicks the small **edit** link in the
footer, types their email, and pastes the 6-digit code that arrives in
their inbox. After that, they can change any text or image on any page
in the same browser tab for up to **4 hours** before the editor
sign-in expires and they have to re-OTP.

Only one person can edit at a time. While someone is editing, a yellow
banner shows across the top of every page for everyone else, and the
footer "edit" link is dimmed until the editor saves, cancels, or the
lock times out (10 minutes of inactivity).

---

## Deploying to Netlify

This site uses four Netlify Functions (`content`, `image`, `lock`, `otp`)
plus the Netlify Blobs stores `site-content`, `site-images`,
`site-locks`, and `site-otp`. There is nothing to configure in the
Netlify dashboard for the blob stores — they are created on first
write.

The OTP function needs **one** environment variable on the Netlify site:

| Env var          | Where to set                                  | Value                                |
|------------------|-----------------------------------------------|--------------------------------------|
| `RESEND_API_KEY` | Netlify → Site → Site settings → Environment variables | Resend API key (starts with `re_`) |

### One-time Resend setup

1. Sign up at <https://resend.com>. Free tier is enough — the OTP
   function only sends a handful of emails per editor session, well
   under any rate limits.
2. Create an API key (Dashboard → API Keys → Create). Copy it.
3. Paste the key as `RESEND_API_KEY` in the Netlify env vars for the
   `hidden-gem-editable` site, then redeploy.
4. **Optional but recommended:** verify the
   `hiddengemhealingutah.com` domain in Resend (Dashboard → Domains
   → Add). Until DNS is verified, the function will automatically fall
   back to sending from `onboarding@resend.dev`, which works but lands
   in spam more often.
   - The "from" addresses are hard-coded near the top of `otp.mjs`:
     - Primary:  `Hidden Gem <noreply@hiddengemhealingutah.com>`
     - Fallback: `Hidden Gem <onboarding@resend.dev>`

### First deploy / link

From this `hidden-gem/` folder:

```bash
# 1. Install the @netlify/blobs dependency used by the functions
npm install

# 2. Log in (first time only — opens a browser)
npx netlify-cli login

# 3. Link this folder to its Netlify site (or `init` if creating new)
npx netlify-cli link

# 4. Deploy to production
npx netlify-cli deploy --prod
```

### Subsequent deploys

After any edit to the source HTML/CSS/JS/functions:

```bash
npx netlify-cli deploy --prod
```

(Or just `git push` to `main` — Netlify auto-deploys.)

---

## Rotating / managing the whitelist

The whitelist is hard-coded near the top of
`hidden-gem/netlify/functions/otp.mjs`:

```js
const WHITELIST = new Set([
  'etorres@care.life',
  'elena@hiddengemhealingutah.com'
]);
```

- **Adding someone:** add a lowercase email to the set, commit, push,
  redeploy. The new address can OTP immediately.
- **Removing someone:** delete the entry, commit, push, redeploy. The
  removed address's *future* sign-in attempts will be silently dropped
  (we always return `{ ok: true }` to a `request` for unknown
  addresses, so the change is invisible to the kicked user).
- **Invalidating someone who currently holds a 4-hour token:** removing
  them from the whitelist does **not** invalidate an outstanding token.
  To revoke immediately, open the Netlify Blobs UI (Site →
  Integrations → Blobs → `site-otp`) and delete the relevant
  `token:<32hex>` entry. The editor will start getting 401s on the
  next save / heartbeat and be prompted to sign in again.

If you need a way to invalidate *all* outstanding tokens at once, the
simplest hammer is to delete every key prefixed `token:` from the
`site-otp` blob store.

---

## How it works

### Auth flow

1. Visitor clicks the **edit** link in the footer.
2. Inline modal asks for email. `POST /.netlify/functions/otp`
   `{action:"request", email}`. The function:
   - Returns `{ok:true}` no matter what the email is (so an attacker
     can't probe for whitelisted addresses).
   - If the email is whitelisted: generates a 6-digit code, stores it
     in the `site-otp` blob keyed `email:<email>` with a timestamp,
     emails it via the Resend HTTP API.
3. Modal switches to the code step. `POST /.netlify/functions/otp`
   `{action:"verify", email, code}`. The function:
   - Returns 401 if the address is not whitelisted, or the stored
     code is missing / expired (>10 min) / mismatched.
   - On success: deletes the stored code (single-use), mints a 32-hex
     token, stores it in the `site-otp` blob keyed `token:<token>`
     with a timestamp, and returns `{ok:true, token}`.
4. Client stashes the token in `sessionStorage` under `hg-edit-token`,
   then calls `acquire` on the lock and enters edit mode.
5. Every subsequent write (content save, image upload, lock
   acquire / refresh / release) sends an `x-hg-token: <token>` header.
   The write functions look up `token:<token>` in `site-otp` and
   return 401 if missing or older than 4 hours. **GET requests are
   unauthenticated** — visitors still need to load overrides and the
   lock status.
6. The 4-hour TTL is enforced at *read time*, not by deleting the
   blob. Stale entries are eventually overwritten on the next mint;
   we don't run a sweeper.

### Token expiry while mid-edit

- The editor heartbeats the lock every 30s. The first heartbeat that
  hits a 401 surfaces a single alert ("Your editor sign-in has
  expired. Click 'edit' in the footer to sign in again.") and drops
  the user out of edit mode. Any unsaved changes are lost.
- A `Save` click that 401s shows a louder message ("Your changes were
  NOT saved. Sign in again and re-apply them."). The DOM is left as
  the user had it so they can copy/paste their text into the next
  session if they want to, but the next page navigation will revert.
- The session token is cleared from `sessionStorage` either way, so
  the next click on "edit" re-runs the OTP flow.

### Element keys (unchanged from before)

Every editable element gets a stable `data-edit-key` assigned at page
load, based on the page name and its order in the document. As long as
you don't reorder or remove elements in the source HTML, the keys stay
stable and saved text keeps mapping to the right element.

Two keying namespaces coexist:

- **Legacy namespace `${page}:${idx}`** (e.g. `home:0`, `about:12`) —
  used for the element types in `EDITABLE_SELECTOR` (`js/editor.js`):
  `h1`–`h6`, `p`, `li`, `blockquote`, `figcaption`, `button`,
  `a.btn-primary`, `a.btn-secondary`, `a.btn-white`, `span.cred`,
  `div.hero-badge`. Indexes here are very index-sensitive — adding a
  new selector to this list would shift every downstream key and break
  every existing blob entry. **Don't add to `EDITABLE_SELECTOR`.**
- **Extended namespace `${page}:ext:${idx}`** (e.g. `home:ext:3`) —
  used for element types in `EXT_EDITABLE_SELECTOR`: `.section-label`,
  `.persona-tag`, `.faq-q`, `.faq-a`, footer text (`footer h4`,
  `footer p`, `footer a`), and nav links (`nav a`, `.nav-links a`).
  Has its own independent index counter, so adding more categories
  here does not affect legacy keys. **Add new editable element types
  to this list.**

Images use `${page}:img:${idx}`, separate from both text namespaces.

### Backend

- **`netlify/functions/otp.mjs`** — `POST { action: "request" | "verify" }`.
  See "Auth flow" above. Whitelist is hard-coded in the file.
- **`netlify/functions/content.mjs`** — `GET` (public) fetches the
  saved overrides for a page; `POST` (auth) merges updates into the
  page's blob.
- **`netlify/functions/image.mjs`** — `GET` (public) serves uploaded
  binary; `POST` (auth) accepts a multipart upload.
- **`netlify/functions/lock.mjs`** — `GET` (public) returns the
  current editor (if any); `POST` (auth) with
  `action: "acquire" | "refresh" | "release"` manages the lock.
- Blobs live in four stores: `site-content`, `site-images`,
  `site-locks`, and `site-otp`.

### Client

- On page load, the editor fetches `/.netlify/functions/content?page=...`
  and applies each saved field to the matching element's `innerHTML`.
- A background poll hits `/.netlify/functions/lock` every 5 seconds
  and shows the yellow "someone is editing" banner if another session
  holds the lock.
- Clicking **edit** in the footer opens the OTP modal (or, if a
  token is already in `sessionStorage`, skips straight to lock
  acquisition).
- A heartbeat refreshes the lock every 30 seconds; `beforeunload`
  fires a `sendBeacon` release in case the editor closes the tab.
  (Beacon can't send custom headers, so it carries the token in the
  body; if `lock.mjs` rejects the release, the lock will time out on
  its own within 10 minutes.)
- **Save** posts only the changed fields back to `content` and calls
  `release`.

### Reverting a change

The editor does not keep a version history. To undo something, open
the Netlify Blobs UI (Site → Integrations → Blobs) and delete the
field from the JSON for that page — the element falls back to the
original text baked into the HTML.

### Baking live edits into the static HTML

Edits live as overrides on top of the static HTML. On first paint the
visitor briefly sees the un-edited HTML before `loadOverrides()`
swaps in the saved content. To eliminate that flash (and to put the
live content under version control), run from the repo root:

```bash
pip install requests beautifulsoup4
python scripts/bake_hidden_gem_edits.py
```

The script reads each page's overrides from
`https://hidden-gem-editable.netlify.app/.netlify/functions/content?page=...`,
applies them to `hidden-gem/*.html`, and downloads any uploaded
images into `hidden-gem/images/edits/`. Inspect with
`git diff hidden-gem/`, then commit. The script does not clear the
blobs — overlays continue to apply at runtime and are now identical
to the baked content, which is harmless. Re-run the script when
enough new edits have accumulated to be worth flushing.

### Security

- The whitelist is the only access control on writes. Resend will not
  deliver a code to a non-whitelisted address, and the `verify` step
  401s for any non-whitelisted email even if a code is presented.
- Saved content is written as `innerHTML`, so anyone editing could in
  theory paste a `<script>` tag. The whitelist is meant to be small
  and trusted (currently 2 entries), which is the mitigation. If the
  list grows or you start sharing tokens externally, add sanitization
  in `content.mjs` before writing to the blob.
- Tokens are stored in `sessionStorage`, so they die when the tab
  closes (in addition to the 4-hour server-side TTL).
- The `RESEND_API_KEY` env var is the only secret. Keep it in Netlify
  env vars, not in the repo.

---

## Running locally with working Save

The static `python -m http.server` preview **will not** run the
Netlify Functions — you'll see the editor UI but Save and the OTP
flow will fail. To test the full stack locally, use Netlify Dev:

```bash
npm install
RESEND_API_KEY=re_your_key_here npx netlify-cli dev
```

That spins up both the static server and the functions runtime at
`http://localhost:8888`. Without `RESEND_API_KEY` set, the `request`
step will return a 500 and the modal will show "Could not send code".
