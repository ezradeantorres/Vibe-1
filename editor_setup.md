# Hidden Gem Healing — Editable Site

This folder is a copy of the main site plus an in-page editor. Anyone who
visits the URL can click the ✏️ Edit button in the top-right corner, type
in their name, change any text block on the page, and save. Saved changes
are stored in **Netlify Blobs** and appear for every other visitor on
their next page load.

Only one person can edit at a time. While someone is editing, a yellow
banner shows across the top of every page for everyone else, and their
Edit button is disabled until the editor saves, cancels, or the lock
times out (10 minutes of inactivity).

Only share the URL with people you trust — there is no password.

---

## Deploying to Netlify

This site uses two Netlify Functions (`content` and `lock`) plus the
Netlify Blobs store. There is nothing to configure in the Netlify
dashboard — the Blobs store is created on first write.

From this `editable/` folder:

```bash
# 1. Install the @netlify/blobs dependency used by the functions
npm install

# 2. Log in (first time only — opens a browser)
npx netlify-cli login

# 3. Create a new Netlify site and link this folder to it
npx netlify-cli init

# 4. Deploy to production
npx netlify-cli deploy --prod
```

Netlify will print the public URL when the deploy completes. That URL is
the editable site — share it only with people you trust.

### Subsequent deploys

After any edit to the source HTML/CSS/JS/functions:

```bash
npx netlify-cli deploy --prod
```

---

## How it works

### Element keys

Every block of text (`h1`–`h6`, `p`, `li`, `blockquote`, `figcaption`,
`button`) gets a stable `data-edit-key` based on the page name and its
order in the document — e.g. `home:0`, `about:12`. As long as you don't
reorder or remove elements in the source HTML, the keys stay stable and
saved text keeps mapping to the right element.

### Backend

- **`netlify/functions/content.mjs`** — `GET` fetches the saved overrides
  for a page, `POST` merges updates into the page's blob.
- **`netlify/functions/lock.mjs`** — `GET` returns the current editor
  (if any), `POST` with `action: "acquire" | "refresh" | "release"`
  manages the lock. Acquires fail if someone else's lock is fresh (held
  within the last 10 minutes).
- Blobs live in two stores: `site-content` (one JSON blob per page) and
  `site-locks` (one JSON blob keyed `editor`).

### Client

- On page load, the editor fetches `/.netlify/functions/content?page=...`
  and applies each saved field to the matching element's `innerHTML`.
- A background poll hits `/.netlify/functions/lock` every 5 seconds and
  shows the yellow "someone is editing" banner if another session holds
  the lock.
- Clicking **Edit** prompts for the editor's name, calls `acquire`, and
  if granted switches every editable block to `contenteditable`.
- A heartbeat refreshes the lock every 30 seconds; `beforeunload` fires a
  `sendBeacon` release in case the editor closes the tab.
- **Save** posts only the changed fields back to `content` and calls
  `release`.

### Reverting a change

The editor does not keep a version history. To undo something, open the
Netlify Blobs UI (Site → Integrations → Blobs) and delete the field from
the JSON for that page — the element falls back to the original text
baked into the HTML.

### Security

- There is no password. Anyone who has the URL can click Edit, type any
  name, and change the text. Keep the link private.
- Saved content is written as `innerHTML`, so anyone editing could in
  theory paste a `<script>` tag. If this becomes a concern, add Netlify
  Identity (or Auth0, Clerk, etc.) in front of the functions and require
  an authenticated session before allowing writes.

---

## Running locally with working Save

The static `python -m http.server` preview **will not** run the Netlify
Functions — you'll see the editor UI but Save will fail silently. To test
the full stack locally, use Netlify Dev:

```bash
npm install
npx netlify-cli dev
```

That spins up both the static server and the functions runtime at
`http://localhost:8888`.
