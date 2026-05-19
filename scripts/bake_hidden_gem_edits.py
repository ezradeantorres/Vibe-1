#!/usr/bin/env python3
"""
One-shot: bake live Netlify Blob overrides for the Hidden Gem site
into the static HTML files in hidden-gem/.

Eliminates the first-paint flash where pre-edit HTML shows briefly
before editor.js hydrates the latest content from Netlify Blobs.

Usage:
    pip install requests beautifulsoup4
    python scripts/bake_hidden_gem_edits.py

Run from the repo root. Modifies files in hidden-gem/ in place. Inspect
the diff (`git diff hidden-gem/`) before committing.

Existing Netlify Blob entries are NOT cleared. After baking, the editor
overlays them onto identical content at runtime, which is harmless.
The site-content blob continues to grow as contributors edit; bake again
when you want to flush new edits into static HTML.
"""

import os
import sys
import mimetypes
from pathlib import Path

import requests
from bs4 import BeautifulSoup

REPO_ROOT = Path(__file__).resolve().parent.parent
HIDDEN_GEM = REPO_ROOT / "hidden-gem"
EDITS_DIR = HIDDEN_GEM / "images" / "edits"

SITE = "https://hidden-gem-editable.netlify.app"
PAGE_FILES = [
    "index.html",
    "about.html",
    "abbey.html",
    "sara-equine.html",
    "sara-psychiatric.html",
    "sam-pediatric.html",
    "keira-aesthetics.html",
]

# Mirror EDITABLE_SELECTOR in hidden-gem/js/editor.js. Keep in sync.
EDITABLE_SELECTORS = (
    "h1, h2, h3, h4, h5, h6, "
    "p, li, blockquote, figcaption, "
    "button, "
    "a.btn-primary, a.btn-secondary, a.btn-white, "
    "span.cred, div.hero-badge"
)

# Mirror EXT_EDITABLE_SELECTOR in editor.js. Keys land in `${page}:ext:N`
# and are indexed only over elements not already matched by the legacy
# selector — matching collectExtraEditables() behavior in JS.
EXT_EDITABLE_SELECTORS = (
    ".section-label, .persona-tag, .ps-eyebrow, "
    ".faq-q, .faq-a, "
    "footer h4, footer p, footer a"
)


def sanitize_override_html(html):
    """Mirror sanitizeOverrideHTML() in hidden-gem/js/editor.js.

    Strip editor chrome a previous editor version may have round-tripped
    into stored blob values: contenteditable + .hg-editable + data-edit-key
    + the data-start/data-end/data-is-only-node/data-is-last-node markers,
    the <div aria-hidden="true" class="pointer-events-none ..."> cruft,
    empty <p> tags, and nested <p><p>...</p></p> patterns. Keeps the
    static HTML the source of truth even when the blob is dirty.
    """
    if not isinstance(html, str) or not html:
        return html
    soup = BeautifulSoup(html, "html.parser")

    for el in soup.find_all(attrs={"contenteditable": True}):
        del el["contenteditable"]
    for el in soup.find_all(attrs={"data-edit-key": True}):
        del el["data-edit-key"]
    for attr in ("data-start", "data-end", "data-is-only-node", "data-is-last-node"):
        for el in soup.find_all(attrs={attr: True}):
            del el[attr]
    for el in soup.select(".hg-editable"):
        classes = [c for c in el.get("class", []) if c != "hg-editable"]
        if classes:
            el["class"] = classes
        else:
            del el["class"]

    # Strip inline background-color from <span style="..."> (artifact of the
    # browser's highlight tool being applied inside the editor; renders as
    # visible cream stripes behind hero text). Drop the declaration; if
    # nothing else is in the style attribute, drop the attribute entirely.
    import re as _re
    for el in soup.find_all("span", style=True):
        cleaned = _re.sub(r"background-color\s*:[^;]*;?\s*", "", el["style"]).strip()
        if cleaned:
            el["style"] = cleaned
        else:
            del el["style"]

    for el in soup.select('div[aria-hidden="true"].pointer-events-none'):
        el.decompose()

    for p in soup.find_all("p"):
        if not p.get_text(strip=True) and not p.find(True):
            p.decompose()

    for inner in soup.select("p > p"):
        outer = inner.parent
        idx = list(outer.contents).index(inner)
        for child in list(inner.contents):
            outer.insert(idx, child)
            idx += 1
        inner.decompose()

    # Defense-in-depth allowlist. Mirrors editor.js sanitizeOverrideHTML().
    # Tags not on ALLOWED_TAGS get unwrapped (content survives, markup
    # discarded). Script-like containers in DROP_TAGS get decomposed
    # entirely. Allowed attributes per tag live in ALLOWED_ATTRS; URL
    # attributes are scheme-checked against SAFE_URL_RE. The trust
    # boundary is EDITOR_PASSWORD (defaults to 'chloe' if unset, see
    # hidden-gem/netlify/functions/otp.mjs FALLBACK_PASSWORD).
    allowed_tags = {"a", "b", "br", "blockquote", "em", "i", "li", "ol", "p", "span", "strong", "u", "ul"}
    drop_tags = {"script", "style", "iframe", "object", "embed", "link", "meta", "base", "form", "input", "button", "select", "textarea", "audio", "video", "svg", "math"}
    allowed_attrs = {"a": {"href"}}
    safe_url_re = _re.compile(r"^(?:https?:|mailto:|tel:|[/?#])|^[^:]*$", _re.I)
    for el in list(soup.find_all(True)):
        if el.parent is None:
            continue
        tag = (el.name or "").lower()
        if tag in drop_tags:
            el.decompose()
            continue
        if tag not in allowed_tags:
            el.unwrap()
            continue
        allowed = allowed_attrs.get(tag, set())
        for attr_name in list(el.attrs.keys()):
            if attr_name.lower() not in allowed:
                del el[attr_name]
                continue
            if attr_name.lower() == "href":
                if not safe_url_re.match(str(el[attr_name]).strip()):
                    del el[attr_name]

    return str(soup)


def get_page_key(soup):
    body = soup.find("body")
    if body and body.get("data-page"):
        return body["data-page"]
    return None


def is_skipped_text(el):
    # Mirror collectEditables() filters in editor.js.
    for parent in el.parents:
        if parent.get("id") == "hg-editor-ui":
            return True
    if (el.get("id") or "").startswith("hg-"):
        return True
    if not (el.get_text() or "").strip():
        return True
    return False


def is_skipped_img(img):
    for parent in img.parents:
        if parent.get("id") == "hg-editor-ui":
            return True
    return False


def collect_text_nodes(soup):
    return [el for el in soup.select(EDITABLE_SELECTORS) if not is_skipped_text(el)]


def collect_ext_text_nodes(soup, legacy_nodes):
    # Mirrors JS collectExtraEditables(): include ext-selector elements,
    # skipping any the legacy selector already matched (they keep their
    # legacy ${page}:N key, so the :ext: counter doesn't advance).
    legacy_ids = {id(n) for n in legacy_nodes}
    return [
        el for el in soup.select(EXT_EDITABLE_SELECTORS)
        if not is_skipped_text(el) and id(el) not in legacy_ids
    ]


def collect_img_nodes(soup):
    return [img for img in soup.find_all("img") if not is_skipped_img(img)]


def fetch_overrides(page_key):
    url = f"{SITE}/.netlify/functions/content?page={page_key}"
    print(f"  Fetching {url}")
    r = requests.get(url, timeout=20, headers={"cache-control": "no-store"})
    if r.status_code == 404:
        return {}
    r.raise_for_status()
    body = r.text.strip()
    if not body:
        return {}
    return r.json()


def download_image(override_value, key):
    # override_value is typically "/.netlify/functions/image?key=...&v=..."
    # or an absolute URL; resolve relative URLs against SITE.
    url = SITE + override_value if override_value.startswith("/") else override_value
    print(f"    Downloading {key} <- {url}")
    r = requests.get(url, timeout=30)
    r.raise_for_status()

    content_type = r.headers.get("content-type", "image/jpeg").split(";")[0].strip()
    ext = mimetypes.guess_extension(content_type) or ".jpg"
    if ext == ".jpe":
        ext = ".jpg"

    safe_key = key.replace(":", "_")
    EDITS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = EDITS_DIR / f"{safe_key}{ext}"
    out_path.write_bytes(r.content)
    return out_path


def hg_hash_content(text):
    """Stable content-addressable hash. MUST match hgHashContent() in
    hidden-gem/js/editor.js -- same DJB2, same whitespace collapse."""
    if not text:
        return "0"
    import re
    s = re.sub(r"\s+", " ", text).strip()
    h = 5381
    for c in s:
        h = ((h * 33) ^ ord(c)) & 0xFFFFFFFF
    # base-36 representation, matches JS's (h >>> 0).toString(36)
    out = ""
    n = h
    if n == 0:
        return "0"
    while n > 0:
        n, r = divmod(n, 36)
        out = ("0123456789abcdefghijklmnopqrstuvwxyz"[r]) + out
    return out


def _apply_text_value(target, val):
    """Common: clear target, parse+sanitize val, append, flatten same-tag nesting."""
    target.clear()
    fragment = BeautifulSoup(sanitize_override_html(val), "html.parser")
    for child in list(fragment.contents):
        target.append(child)
    _unwrap_self_nested(target)


def apply_overrides(soup, overrides):
    text_nodes = collect_text_nodes(soup)
    ext_nodes = collect_ext_text_nodes(soup, text_nodes)
    img_nodes = collect_img_nodes(soup)

    # Build hash-indexed lookups for content-addressable keys (new system).
    text_by_hash = {hg_hash_content(n.get_text()): n for n in text_nodes}
    ext_by_hash = {hg_hash_content(n.get_text()): n for n in ext_nodes}

    text_count = ext_count = img_count = 0

    for key, val in overrides.items():
        parts = key.split(":")
        last = parts[-1] if parts else ""

        if ":img:" in key:
            try:
                idx = int(last)
            except ValueError:
                print(f"  ! Malformed image key, skipping: {key}")
                continue
            if idx >= len(img_nodes):
                print(f"  ! img idx {idx} out of range ({len(img_nodes)} imgs) for {key}")
                continue
            try:
                local = download_image(val, key)
            except Exception as exc:
                print(f"  ! Image download failed for {key}: {exc}")
                continue
            rel = os.path.relpath(local, HIDDEN_GEM).replace(os.sep, "/")
            img_nodes[idx]["src"] = rel
            img_count += 1
            continue

        is_ext = "ext" in parts
        is_hash_key = last.startswith("h") and len(last) > 1

        if is_ext:
            if is_hash_key:
                target = ext_by_hash.get(last[1:])
                if target is None:
                    # Drift-resistant: blob entry's hash doesn't match any
                    # current element. Static HTML wins for that slot.
                    print(f"  - ext hash {last} no match in current DOM; skipping")
                    continue
                _apply_text_value(target, val)
                ext_count += 1
            else:
                try:
                    idx = int(last)
                except ValueError:
                    print(f"  ! Malformed ext key, skipping: {key}")
                    continue
                if idx >= len(ext_nodes):
                    print(f"  ! ext idx {idx} out of range; skipping")
                    continue
                _apply_text_value(ext_nodes[idx], val)
                ext_count += 1
            continue

        # Legacy text namespace.
        if is_hash_key:
            target = text_by_hash.get(last[1:])
            if target is None:
                print(f"  - text hash {last} no match in current DOM; skipping")
                continue
            _apply_text_value(target, val)
            text_count += 1
        else:
            try:
                idx = int(last)
            except ValueError:
                print(f"  ! Malformed text key, skipping: {key}")
                continue
            if idx >= len(text_nodes):
                print(f"  ! text idx {idx} out of range; skipping")
                continue
            _apply_text_value(text_nodes[idx], val)
            text_count += 1

    return text_count, ext_count, img_count


def _unwrap_self_nested(target):
    """If target.append() produced `<p class="ps-body"><p>text</p></p>` or
    similar same-tag nesting, unwrap the inner one. Same for li, div, span.
    Handles the bake-bug residue where blob values stored a wrapping <p>
    that, when appended into an already-<p> target, creates nested <p>s."""
    nestable = {"p", "li", "div", "span"}
    if target.name not in nestable:
        return
    children = [c for c in target.contents if not (isinstance(c, str) and not c.strip())]
    if len(children) == 1 and getattr(children[0], "name", None) == target.name:
        children[0].unwrap()


def main():
    if not HIDDEN_GEM.is_dir():
        sys.exit(f"hidden-gem/ not found at {HIDDEN_GEM}")

    grand_text = grand_ext = grand_img = 0
    for filename in PAGE_FILES:
        path = HIDDEN_GEM / filename
        if not path.is_file():
            print(f"  ! Missing file, skipping: {path}")
            continue

        print(f"\n=== {filename} ===")
        soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")

        page_key = get_page_key(soup)
        if not page_key:
            print(f"  ! No <body data-page=...>; skipping")
            continue

        try:
            overrides = fetch_overrides(page_key)
        except Exception as exc:
            print(f"  ! Fetch failed for '{page_key}': {exc}")
            continue

        if not overrides:
            print(f"  - No overrides for page '{page_key}'")
            continue

        print(f"  {len(overrides)} override(s) for page '{page_key}'")
        text_count, ext_count, img_count = apply_overrides(soup, overrides)

        path.write_text(str(soup), encoding="utf-8")
        print(f"  Wrote {filename}: {text_count} text, {ext_count} ext, {img_count} image baked")
        grand_text += text_count
        grand_ext += ext_count
        grand_img += img_count

    print(f"\nDone. {grand_text} text + {grand_ext} ext + {grand_img} image override(s) baked.")
    print("Inspect with `git diff hidden-gem/` before committing.")


if __name__ == "__main__":
    main()
