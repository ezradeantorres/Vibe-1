# Hidden Gem Content Model

This is the reference for anyone adding a new page, a new section, or a new editable element to the Hidden Gem site (`hidden-gem/`). Scope: design tokens, typography, the page skeleton, component vocabulary, and the editor/bake selector contract. Architecture (how Blobs / Netlify Functions / the bake script fit together) lives in `docs/architecture.md`; operational/env-var concerns live in `docs/runbook.md`.

## 1. Design tokens

All custom properties are declared in `:root` in `hidden-gem/css/styles.css`. Use these instead of inlining hex values.

| Token | Value | Semantic role |
|---|---|---|
| `--deep` | `#1E3A2F` | Primary brand background (footer, trust bar, CTA gradient end, headings) |
| `--sage` | `#3D6B5A` | Primary brand accent (primary buttons, links, italics in headings) |
| `--mid` | `#5E8E7A` | Mid-sage; reserved (declared but lightly used in components) |
| `--light` | `#A8C5B8` | Light sage tint; reserved |
| `--pale` | `#D4E4DC` | Pale sage; hero gradient end, cross-link banner background |
| `--cream` | `#FAF8F4` | Default page background; primary surface |
| `--warm` | `#F5F0E8` | Secondary section background (testimonials, quiz, page-hero) |
| `--gold` | `#B8924A` | Gold accent (status-chip dot, divider, why-quote border) |
| `--gold-light` | `#D4B06A` | Lighter gold (footer hovers, page-divider text, trust strongs) |
| `--gold-text` | `#8C6B33` | AA-passing dark tan for `.section-label` on cream |
| `--text` | `#2A2A2A` | Default body text |
| `--text-prose` | `#4A4A4A` | AAA-passing paragraph copy color on cream |
| `--text-light` | `#6B6B6B` | Secondary/tertiary UI text |
| `--white` | `#FFFFFF` | Pure white surface (book form, mega-menu, price cards) |
| `--earth` | `#6B5B3E` | Earth-tone accent (split-card `.sc-earth` tag) |
| `--earth-light` | `#F5F0E6` | Earth surface (split-card `.sc-earth` background) |

There are no spacing or radius tokens. Spacing is inline (`padding: 110px 0` on `section`, `gap: 28px`), border-radius is per-component (`100px` for pills, `16px`-`24px` for cards). Canonical shadow: `0 8px 30px rgba(30,58,47,0.15)`. Container width is fixed: `.container { max-width: 1200px; margin: 0 auto; padding-inline: clamp(20px, 5vw, 48px); }`.

## 2. Typography

Two Google Fonts, loaded with `preconnect` on every page:

```html
<link href="https://fonts.googleapis.com" rel="preconnect"/>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&amp;family=Outfit:wght@300;400;500;600&amp;display=swap" rel="stylesheet"/>
```

| Family | Role | Weights in use | CSS rule |
|---|---|---|---|
| Cormorant Garamond (serif) | Headings, blockquotes, italics in hero | 500 (default h1–h5), 600 (`.faq-q`, `.t-name`, `.h-name`, `.price-card h3`), 400/500 italic for emphasis | `h1,h2,h3,h4,h5 { font-family: 'Cormorant Garamond', serif; font-weight: 500; }` |
| Outfit (sans) | Body, buttons, nav, form controls | 300 (body default), 400, 500 (buttons, nav, section labels), 600 (`.section-label`, `.h-name`) | `body { font-family: 'Outfit', sans-serif; font-weight: 300; line-height: 1.7; }` |

There is no type-scale utility class system. Section-level type sizing comes from the component classes below: `.section-title` (`clamp(30px, 4vw, 50px)`), `.section-desc` (16px), `.section-label` (12px / 2px tracking / uppercase). Hero h1 has its own ramp: `clamp(36px, 8vw, 60px)`. Italics inside headings get the sage accent automatically: `.hero h1 em, .ps-title em, .section-title em { font-style: italic; color: var(--sage); }`.

## 3. Page structure (template pattern)

Every public page in `hidden-gem/` follows the same skeleton. Copy from `index.html` or `sam-pediatric.html` as the working reference.

### 3.1 Pages that exist

| File | `body[data-page]` | Role |
|---|---|---|
| `index.html` | `home` | Marketing home with hero, two-paths grid, trust bar, locations map, testimonials, Beta Care-Fit Quiz. |
| `about.html` | `about` | Team, the herd, pricing, FAQ, and the Netlify-Forms `appointment` form (`#contact`). |
| `abbey.html` | `abbey` | Abbey Lind's integrative primary care page (tabs of specialties, services grid, pricing). |
| `sara-psychiatric.html` | `sara-psych` | Sara Jones's integrative psychiatry page. |
| `sara-equine.html` | `sara-equine` | Sara Jones's equine-assisted psychotherapy page. |
| `sam-pediatric.html` | `sam` | Samantha Hubert pediatric primary care **coming-soon stub**. |
| `keira-aesthetics.html` | `keira` | Keira Spencer aesthetics & regenerative medicine **coming-soon stub**. |
| `no-surprises-act.html` | `no-surprises-act` | Federal Good-Faith-Estimate / NSA disclosures. |
| `privacy.html` | `privacy` | HIPAA Notice of Privacy Practices. |
| `404.html` | `404` | Not-found page; same nav and footer chrome, simpler body. |

### 3.2 Required `<head>` block

```html
<head>
<meta charset="utf-8"/>
<link href="images/favicon.png" rel="icon" type="image/png"/>
<link href="images/apple-touch-icon.png" rel="apple-touch-icon"/>
<link href="https://hiddengemhealingutah.com/<slug>" rel="canonical"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>...</title>
<meta content="..." name="description"/>
<meta content="..." property="og:title"/>
<meta content="..." property="og:description"/>
<meta content="website" property="og:type"/>
<meta content="Hidden Gem Healing" property="og:site_name"/>
<meta content="https://hiddengemhealingutah.com/images/hero-sara-horses.jpg" property="og:image"/>
<meta content="summary_large_image" name="twitter:card"/>
<!-- Optional MedicalBusiness JSON-LD on provider pages -->
<link href="https://fonts.googleapis.com" rel="preconnect"/>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:..." rel="stylesheet"/>
<link href="css/styles.css" rel="stylesheet"/>
<link href="css/editor.css" rel="stylesheet"/>
</head>
```

`css/editor.css` is loaded on every editable page so editor chrome is styled before `editor.js` mounts. `404.html` omits it (no editor surface there).

### 3.3 Body shell

Every page opens with `<body data-page="<key>">`. The `data-page` value is the namespace for the editor's content-blob key (`${pageKey}:h${hash}`), so it must be unique per page and stable forever — renaming it orphans every saved override.

Body contents, in order: (1) Netlify-Forms hidden stub form (only on `index.html` — `<form hidden="" name="appointment" netlify="" netlify-honeypot="bot-field">...</form>`); (2) `<!-- SHARED: NAV -->...<!-- END SHARED: NAV -->`; (3) page-specific `<section>` blocks; (4) `<!-- SHARED: FOOTER -->...<!-- END SHARED: FOOTER -->`; (5) trailing scripts on every page:

```html
<script src="js/main.js"></script>
<script src="js/editor.js" type="module"></script>
```

`index.html` also ships Leaflet inline (`https://unpkg.com/leaflet@1.9.4/...`) for the locations map; that's a per-page exception, not part of the standard skeleton.

### 3.4 Nav, mega-menu, footer

Top-level nav lives in `<nav id="nav">`. The five service pages are surfaced through a `.nav-dropdown` containing a `.dropdown-menu.mega-menu` grid of five `.mega-item` tiles (each an `<a>` with an SVG `.mega-item-icon`, a `.mega-item-title`, and a `.mega-item-sub`). `hidden-gem/js/main.js` wires the behavior: `nav.scrolled` toggles past `scrollY > 40`; `.hamburger` opens `.mobile-menu.open` under 968px; `body[data-page]` is mapped to a `data-nav` key via the `navKeyForPage` table so all five service pages light up the single "Services" trigger; ARIA `aria-expanded` is mirrored on hover/focus. When adding a page, decide whether it goes in `.nav-links` (top-level), `.mega-menu` (service), or only in `.footer-col` — and mirror the entry in `.mobile-menu`.

Footer is a four-column `.footer-grid` (`.footer-brand`, Services, Learn, Contact) followed by `.footer-bottom` (copyright + policy links), `.gfe` (GFE notice), and `.emergency` (911 strip). `editor.js` injects the "edit" link into `.footer-bottom > div:last-child` on every load; it's visible to all visitors, but useless without the password.

## 4. Component vocabulary

All classes below are defined in `hidden-gem/css/styles.css`. Use them verbatim; do not invent class names that drift from these.

### 4.1 Buttons

Three flavors, all 100px-radius pills with uppercase Outfit-500.

```html
<a class="btn-primary" href="about.html#contact">Book an Appointment →</a>
<a class="btn-secondary" href="#paths">Explore Services</a>
<a class="btn-white" href="about.html#contact">Join the waitlist</a>
```

- `.btn-primary`: solid sage on cream/white surfaces. Hover darkens to `--deep` and lifts 2px.
- `.btn-secondary`: outlined sage on transparent. Inverts on hover.
- `.btn-white`: white-on-dark; used inside `.cta-bar` and on the dark trust strip.

All three share a `:focus-visible` outline of `2px solid var(--gold)` for keyboard accessibility.

### 4.2 Section heads

The canonical "section opener" is a three-line block: small uppercase eyebrow, large serif title, prose description.

```html
<div class="section-label">Why Private Pay?</div>
<h2 class="section-title">Your Care, On Your Terms</h2>
<p class="section-desc">Insurance dictates appointment length and reimbursement based on codes — not what you need.</p>
```

- `.section-label`: 12px, 2px tracking, uppercase, `--gold-text`. AA-passing on cream.
- `.section-title`: `clamp(30px, 4vw, 50px)`, `--deep`, Cormorant. `<em>` inside it goes sage italic automatically.
- `.section-desc`: 16px `--text-prose`, max-width 65ch.

### 4.3 Reveal animation

Add `.reveal` to any block that should fade up on scroll. `hidden-gem/js/main.js` wires an `IntersectionObserver` (threshold 0.08, `rootMargin: '-40px'`) that adds `.visible` once. Delay variants stagger siblings: `.d1` (80ms), `.d2` (160ms), `.d3` (240ms), `.d4` (320ms).

```html
<div class="reveal">…</div>
<a class="split-card sc-sage reveal d1" href="…">…</a>
<a class="split-card sc-earth reveal d2" href="…">…</a>
```

`prefers-reduced-motion: reduce` disables the transition entirely.

### 4.4 CTA bar

Full-bleed gradient strip used at the bottom of every provider page. Inside a `.container`, with white text.

```html
<div class="cta-bar">
  <div class="container">
    <h2>Whole-child care, from birth to adulthood.</h2>
    <p>Holladay &amp; Sandy, Utah.</p>
    <div class="cta-actions">
      <a class="btn-white" href="about.html#contact">Join the waitlist</a>
      <a class="btn-secondary" href="tel:+13852579373" style="color:var(--white);border-color:rgba(255,255,255,0.3)">Call Us</a>
    </div>
  </div>
</div>
```

### 4.5 Split cards (home "Two Paths")

Four variants on the home grid (`.split-grid`), each a clickable `<a>`:

```html
<a class="split-card sc-sage reveal d1" href="sara-psychiatric.html">
  <div class="split-photo"><img alt="…" src="images/edits/home_img_2.jpg"/></div>
  <div class="split-body">
    <div class="split-tag">Integrative psychiatry…</div>
    <h3>Healing Through Connection</h3>
    <div class="provider">Sara Jones, PMHNP-BC</div>
    <p>EMDR therapy, psychiatric medication management…</p>
    <div><span class="persona-tag">Adult psychiatric care</span>…</div>
    <span class="split-link">Learn more →</span>
  </div>
</a>
```

Variants: `.sc-sage` (cream + sage), `.sc-earth` (earth-light + brown), `.sc-pediatric` (warm + gold), `.sc-aesthetic` (pale + deep).

### 4.6 Testimonials

Three-column `.testimonials-grid` of `.testimonial-card`s. The home page currently uses **voice-matched placeholders** with a `.testimonials-footnote` disclaiming the placeholder status. Real client quotes will replace these once consented.

```html
<div class="testimonial-card">
  <blockquote>I'd bounced between providers for years…</blockquote>
  <cite>— Patient, 30s</cite>
</div>
```

The yellow left border (`border-left: 4px solid var(--gold)`) is intentional.

### 4.7 Why-section

The "Why Private Pay?" pattern pairs a checklist with a pull-quote.

```html
<ul class="why-benefits">
  <li><span class="why-check">✓</span> Dedicated, meaningful time</li>
  …
</ul>

<div class="why-quote">
  <p>No corporate oversight. No revolving-door providers…</p>
  <cite>— The Hidden Gem Healing Team</cite>
</div>
```

- `.why-benefits`: unstyled `<ul>` with `.why-check` discs.
- `.why-check`: circular sage badge containing the ✓ glyph.
- `.why-quote`: white card with a 3px gold left border and italic Cormorant pull-quote.

### 4.8 Persona tags and credentials

Two near-identical pill classes:

```html
<span class="persona-tag">Adult psychiatric care</span>
<span class="cred">PMHNP-BC</span>
```

`.persona-tag` is for audience labels; `.cred` is for letters-after-a-name credentials. Both are sage pills on a 6%-sage background. Visually interchangeable; keep them semantically separate so editors can find them.

### 4.9 Quiz components

The Beta Care-Fit Quiz lives only on `index.html#quiz`. Its DOM is initialized by `initCareQuiz()` in `hidden-gem/js/main.js`, which looks for `#quiz` on `DOMContentLoaded`. The `.quiz-*` namespace:

- `.quiz` — outer section (`background: var(--warm)`); `.quiz-card` — white card.
- `.quiz-progress`, `.quiz-progress-bar`, `.quiz-progress-fill`, `.quiz-progress-text` — driven by `[data-quiz-progress]`, `[data-quiz-current]`, `[data-quiz-total]`.
- `.quiz-step` (with `.is-active`) — one per question. The script reads `data-step` (an index or `"results"`) and `data-step-conditional="kids"` to skip step 7 when q1 isn't `child`/`family`.
- `.quiz-q` — serif prompt. `.quiz-options` + `.quiz-option` (a `<label>` wrapping a hidden input) — radio/checkbox pills. Each option declares `data-match="<tag1> <tag2>"` against the routing tally: `sara-psych`, `sara-equine`, `sara-ketamine`, `abbey`, `abbey-migraine`, `sam`, `keira`.
- `.quiz-nav` + `[data-quiz-next]` / `[data-quiz-back]` / `[data-quiz-restart]` — navigation.
- `.quiz-results` / `.quiz-result-card` (+ `.is-comingsoon` for gold left-border) — output cards. Copy comes from the `RESULT_COPY` table in `main.js`; add a tag there to add a routing target.
- `.quiz-beta-tag` — small gold "Beta" chip beside the section label.

### 4.10 Status chips and hero badge

Reusable pulse-dot chip for any "Now Accepting…" line. `.status-chip` and `.hero-badge` share the same rule. Variants: `.status-chip--quiet` (no pulse), `.status-chip--earth` (earth coloring).

```html
<div class="hero-badge">Now Accepting new Clients</div>
<span class="status-chip status-chip--earth">Accepting referrals</span>
```

## 5. Editable surfaces — the bake-aware contract

The site is editable in-browser via `hidden-gem/js/editor.js`, which mirrors changes into a Netlify Blob store. A nightly/manual bake (`scripts/bake_hidden_gem_edits.py`) flushes those blob entries into the static HTML. For the **architecture** of how blobs, lock, OTP, and bake fit together, see [`docs/architecture.md`](architecture.md). What follows here is only the contract a content-model author has to honor.

### 5.1 The four lists that must agree

Two pairs of selector strings — one pair in JS, one pair in Python — drive which DOM nodes the editor turns editable and which nodes the bake script writes overrides into. **They must agree exactly, or the DJB2 hash key derived from each node's text content will resolve to a node in one tool and to nothing in the other**, and saved content silently fails to land.

**`hidden-gem/js/editor.js`** (lines 33–51):

```js
const EDITABLE_SELECTOR = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'li', 'blockquote', 'figcaption',
  'button',
  'a.btn-primary', 'a.btn-secondary', 'a.btn-white',
  'span.cred', 'div.hero-badge'
].join(',');

const EXT_EDITABLE_SELECTOR = [
  '.section-label',
  '.persona-tag',
  '.ps-eyebrow',
  '.faq-q', '.faq-a',
  'footer h4', 'footer p', 'footer a'
].join(',');
```

**`scripts/bake_hidden_gem_edits.py`** (lines 46–61):

```python
EDITABLE_SELECTORS = (
    "h1, h2, h3, h4, h5, h6, "
    "p, li, blockquote, figcaption, "
    "button, "
    "a.btn-primary, a.btn-secondary, a.btn-white, "
    "span.cred, div.hero-badge"
)

EXT_EDITABLE_SELECTORS = (
    ".section-label, .persona-tag, .ps-eyebrow, "
    ".faq-q, .faq-a, "
    "footer h4, footer p, footer a"
)
```

Conceptually:

- `EDITABLE_SELECTOR` / `EDITABLE_SELECTORS` cover **in-place text edits** — headings, paragraphs, list items, blockquotes, native `<button>` text, the three CTA-styled anchor classes, and a couple of pill/badge classes.
- `EXT_EDITABLE_SELECTOR` / `EXT_EDITABLE_SELECTORS` cover **extended** text categories that were added after the namespace was already in production. Keys for these land in a separate `${page}:ext:h<hash>` namespace so adding to the extended list does not shift any legacy `${page}:h<hash>` indexes that already exist in the blob.
- Both lists exclude their own editor chrome (anything under `#hg-editor-ui` or with an `id` starting `hg-`).
- Images are handled separately: `editor.js` matches every `<img>` and assigns positional `${page}:img:<idx>` keys. The bake script does the same and downloads each override into `hidden-gem/images/edits/` on commit.

The keying strategy is **content-addressable** — `hgHashContent(textContent)` (DJB2, base-36) on initial static HTML, frozen as `data-edit-key`. This is drift-resistant: surrounding elements can be reordered without breaking saved entries. It is **not** rename-resistant — changing the visible text of an editable element rotates its hash and its blob entry becomes an orphan. The bake script logs `text hash <h> no match in current DOM; skipping` in that case, and the static HTML wins.

### 5.2 Recipe — adding a new editable surface

Do these in this order:

1. **Add the CSS class or tag to BOTH selector lists.** If it's a brand-new category (e.g. a fresh `.lead-paragraph`), add it to `EXT_EDITABLE_SELECTOR` in `editor.js` AND `EXT_EDITABLE_SELECTORS` in `bake_hidden_gem_edits.py`. The extended namespace is the safe place; adding to the legacy `EDITABLE_SELECTOR` shifts positional keys and corrupts every old `${page}:N` entry that was written before the hash migration.
2. **Re-test the editor locally.** Load any affected page, sign in via the footer "edit" link, click into your new selector. The element should become `contenteditable`, gain `.hg-editable`, and reveal a stable `data-edit-key="${pageKey}:ext:h<hash>"`.
3. **Save a test edit.** Confirm `POST /.netlify/functions/content` returns 200 and that reloading the page shows the new text.
4. **Bake.** Run `python scripts/bake_hidden_gem_edits.py` from repo root, eyeball `git diff hidden-gem/`, and commit. If the diff shows your new element receiving the override, the contract is intact. If you see `ext hash <h> no match in current DOM; skipping`, the JS-side hash and the Python-side hash disagreed — most often because of whitespace differences in the static HTML the bake script reads vs. what the browser collapsed at edit time. Re-save the field from the editor; the new hash will pick up the bake's view of the DOM.

### 5.3 What does NOT belong in the selector lists

- `<a>` tags in general. The blanket `a` would make every nav and footer link editable, including hrefs the bake script does not protect. Stay on the explicit allowlist (`a.btn-primary`, `a.btn-secondary`, `a.btn-white`, plus the `footer a` exception under the extended list).
- Anything inside `#hg-editor-ui`. The collectors already skip it; don't try to override.
- `<img>` tags. They have their own positional `:img:` namespace; do not add `img` to a text selector.

## 6. Photos and images

- **Curated static photos** of Sara, Abbey, the team, the herd, and section-specific imagery live in `hidden-gem/images/`. Naming convention is descriptive-kebab, e.g. `team-elena.jpg`, `horse-machado.jpg`, `card-abbey.jpg`, `abbey-page-hero.jpg`, `equine-trauma.jpg`. There is no enforced size convention; cards crop with `object-fit: cover` and faces shift up with `object-position: center 20%` or `center 25%`.
- **Editor uploads** are posted to `/.netlify/functions/image` (see `hidden-gem/netlify/functions/image.mjs`). The handler stores the binary in the `site-images` Netlify Blob store under the element's edit key, then writes a public URL of the form `/.netlify/functions/image?key=<editKey>&v=<timestamp>` into the page's content blob. So **uploaded images are NOT in git** until the bake.
- **Bake materializes uploaded images.** `bake_hidden_gem_edits.py:download_image()` GETs each `${page}:img:<idx>` override, sniffs the content-type, and writes the bytes to `hidden-gem/images/edits/<page>_img_<idx>.<ext>`. The HTML `<img src>` is rewritten to that relative path. Current edits directory has files like `home_img_1.jpg`, `abbey_img_1.jpg`, `sam_img_1.png`, `keira_img_1.png` — that is the post-bake on-disk fingerprint.
- **Brand logos.** The cream-and-sage horizontal logo for the nav is `hidden-gem/images/logo-nav.png` (44px tall in the nav). The white-on-deep variant for the footer (white horse silhouette + gold-script wordmark) is `hidden-gem/images/logo-white.png`, rendered at 48px tall via inline style. The standalone full-color logo is `hidden-gem/images/logo.png`.

## 7. The "coming soon" pattern

Two provider pages — `sam-pediatric.html` and `keira-aesthetics.html` — are stubs. They exist so the five-tile mega-menu always has live targets and the home `.split-grid` has four anchorable destinations, but the page bodies are intentionally minimal.

How to identify a coming-soon page:

- A short `<section class="ps-grid">` hero with a single `.ps-body` paragraph and a few `.cred` / `.persona-tag` pills.
- A follow-up section with background `var(--warm)`, a `.section-label` of literally "Coming soon", a one-line `.section-title` ("Full pediatric page is on the way." / "Full aesthetics page is on the way."), and a single CTA pointing to `about.html?provider=<key>#contact` (the about-page contact form pre-selects the provider via the `?provider=` query param; see `main.js`).
- An HTML comment near the hero image: `<!-- TODO: replace placeholder photo with real <Name> portrait when available -->`.
- The portrait `<img src>` points at `images/edits/<page>_img_1.png` — a baked-down editor upload, not a curated `images/<name>.jpg`.

To activate one of these pages, delete the `<!-- Coming soon notice -->` section, expand the hero into the full provider-page layout (use `abbey.html` or `sara-psychiatric.html` as a starting template, both with `.ps-grid` heroes, services grids, pricing, FAQ, and a CTA bar), and remove the `Coming Soon` suffix from the relevant entry in `RESULT_COPY` in `hidden-gem/js/main.js`. The mega-menu entry and the home split-card already point at the slug and need no change.
