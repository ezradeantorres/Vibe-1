// ============================================================
//  HIDDEN GEM HEALING — IN-PAGE EDITOR (Netlify Blobs backend)
// ============================================================
//  Loads saved text overrides from a Netlify Function on every
//  page view (public read), and gates editing behind a shared
//  password POSTed to /.netlify/functions/otp. A successful sign-in
//  returns a 32-hex token which the editor stashes in sessionStorage
//  and attaches as `x-hg-token` on every write call.
// ============================================================

const CONTENT_URL = '/.netlify/functions/content';
const LOCK_URL = '/.netlify/functions/lock';
const IMAGE_URL = '/.netlify/functions/image';
const OTP_URL = '/.netlify/functions/otp';

const LOCK_TIMEOUT_MS = 10 * 60 * 1000;   // must match lock.mjs
const LOCK_HEARTBEAT_MS = 30 * 1000;
const LOCK_POLL_MS = 5 * 1000;            // how often we poll the lock status

// Token lives in sessionStorage so it dies when the tab closes; it is
// shared across pages of the site in the same tab so the editor can
// navigate between index/about/abbey/etc. without re-OTP-ing.
const TOKEN_KEY = 'hg-edit-token';

// ---- Page key (one blob per page) -----------------------------------------
const pageKey =
  (document.body && document.body.dataset && document.body.dataset.page) ||
  (location.pathname.split('/').pop().replace('.html', '') || 'index');

// ---- Editable element discovery -------------------------------------------
// Text blocks: titles, paragraphs, list items, quotes, native buttons,
// CTA-styled anchors, and pills/badges used on this site.
const EDITABLE_SELECTOR = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'li', 'blockquote', 'figcaption',
  'button',
  'a.btn-primary', 'a.btn-secondary', 'a.btn-white',
  'span.cred', 'div.hero-badge'
].join(',');

// Extended categories. These live in a separate keying namespace
// (`${pageKey}:ext:N`) so adding to this list does NOT shift the indexes
// of existing `${pageKey}:N` blob entries written by collectEditables().
// If you need more editable element types, add them here, not above.
const EXT_EDITABLE_SELECTOR = [
  '.section-label',
  '.persona-tag',
  '.ps-eyebrow',
  '.faq-q', '.faq-a',
  'footer h4', 'footer p', 'footer a'
].join(',');

function collectEditables() {
  const nodes = Array.from(document.querySelectorAll(EDITABLE_SELECTOR));
  const result = [];
  let idx = 0;
  for (const el of nodes) {
    if (el.closest('#hg-editor-ui')) continue;
    if (el.id && el.id.startsWith('hg-')) continue;
    if (!el.textContent || !el.textContent.trim()) continue;
    if (!el.dataset.editKey) {
      el.dataset.editKey = `${pageKey}:${idx}`;
    }
    idx++;
    result.push(el);
  }
  return result;
}

function collectExtraEditables() {
  const nodes = Array.from(document.querySelectorAll(EXT_EDITABLE_SELECTOR));
  const result = [];
  let idx = 0;
  for (const el of nodes) {
    if (el.closest('#hg-editor-ui')) continue;
    if (el.id && el.id.startsWith('hg-')) continue;
    if (!el.textContent || !el.textContent.trim()) continue;
    // If this element was already keyed by collectEditables() (e.g. a footer
    // <a> that also matches a.btn-primary), keep its existing legacy key and
    // don't double-count it under the :ext: namespace.
    if (el.dataset.editKey) {
      result.push(el);
      continue;
    }
    el.dataset.editKey = `${pageKey}:ext:${idx}`;
    idx++;
    result.push(el);
  }
  return result;
}

// Merge legacy + extended text editables, deduped by element identity.
// Order matters: collectEditables() runs first so any element matching
// both selector lists keeps its legacy `${pageKey}:N` key.
function collectAllTextEditables() {
  const seen = new Set();
  const out = [];
  for (const el of collectEditables()) {
    if (!seen.has(el)) { seen.add(el); out.push(el); }
  }
  for (const el of collectExtraEditables()) {
    if (!seen.has(el)) { seen.add(el); out.push(el); }
  }
  return out;
}

function collectEditableImages() {
  const imgs = Array.from(document.querySelectorAll('img'));
  const result = [];
  let idx = 0;
  for (const img of imgs) {
    if (img.closest('#hg-editor-ui')) continue;
    if (!img.dataset.editImgKey) {
      img.dataset.editImgKey = `${pageKey}:img:${idx}`;
    }
    idx++;
    result.push(img);
  }
  return result;
}

// Strip editor chrome that a previous editor version round-tripped into
// stored blob values: `contenteditable`, `class="hg-editable"`, the
// data-edit-key + data-start/data-end/data-is-only-node/data-is-last-node
// attributes, the `<div aria-hidden="true" class="pointer-events-none …">`
// cruft, empty <p> tags, and nested <p><p>…</p></p> patterns. Without
// this, overlays re-inject corruption into a clean DOM on every load.
function sanitizeOverrideHTML(html) {
  if (typeof html !== 'string' || !html) return html;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  tmp.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
  tmp.querySelectorAll('[data-edit-key]').forEach(el => el.removeAttribute('data-edit-key'));
  ['data-start','data-end','data-is-only-node','data-is-last-node'].forEach(attr => {
    tmp.querySelectorAll('[' + attr + ']').forEach(el => el.removeAttribute(attr));
  });
  tmp.querySelectorAll('.hg-editable').forEach(el => el.classList.remove('hg-editable'));
  tmp.querySelectorAll('[class=""]').forEach(el => el.removeAttribute('class'));

  // Strip inline background-color from <span style="..."> -- artifact of
  // the browser's highlight tool being applied inside the editor; renders
  // as visible cream stripes behind hero text.
  tmp.querySelectorAll('span[style]').forEach(s => {
    const cleaned = (s.getAttribute('style') || '')
      .replace(/background-color\s*:[^;]*;?\s*/gi, '')
      .trim();
    if (cleaned) s.setAttribute('style', cleaned);
    else s.removeAttribute('style');
  });

  tmp.querySelectorAll('div[aria-hidden="true"].pointer-events-none').forEach(el => el.remove());
  tmp.querySelectorAll('p').forEach(p => {
    if (!p.textContent.trim() && p.children.length === 0) p.remove();
  });

  tmp.querySelectorAll('p > p').forEach(inner => {
    const outer = inner.parentElement;
    while (inner.firstChild) outer.insertBefore(inner.firstChild, inner);
    inner.remove();
  });

  return tmp.innerHTML;
}

// ---- Load and apply overrides on every page load --------------------------
async function loadOverrides() {
  const textEls = collectAllTextEditables();
  const imgEls = collectEditableImages();
  try {
    const res = await fetch(`${CONTENT_URL}?page=${encodeURIComponent(pageKey)}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    for (const el of textEls) {
      const key = el.dataset.editKey;
      if (typeof data[key] === 'string') el.innerHTML = sanitizeOverrideHTML(data[key]);
    }
    for (const img of imgEls) {
      const key = img.dataset.editImgKey;
      if (typeof data[key] === 'string') img.src = data[key];
    }
  } catch (err) {
    // Silent — functions aren't available yet (e.g. static local preview)
  }
}

// ---- Token helpers --------------------------------------------------------
function getToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
function setToken(t) {
  try { sessionStorage.setItem(TOKEN_KEY, t); } catch {}
}
function clearToken() {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch {}
}
function authHeaders(base = {}) {
  const t = getToken();
  return t ? { ...base, 'x-hg-token': t } : { ...base };
}

// Common handler when any write returns 401: token has expired or been
// invalidated. Drop it, force-exit edit mode if we were editing, and tell
// the user. The next click on "edit" will re-prompt for email + code.
function handleAuthExpired(context) {
  clearToken();
  if (isEditing) {
    // Try to release the lock; we no longer have a token so this will 401,
    // but the lock will time out on its own in <= 10 minutes either way.
    try { exitEditMode(); } catch {}
  }
  alert(
    'Your editor sign-in has expired. ' +
    'Click "edit" in the footer to sign in again.\n\n' +
    (context ? `(${context})` : '')
  );
}

// ---- Lock state -----------------------------------------------------------
const sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
let heartbeatTimer = null;
let pollTimer = null;
let currentUserName = '';

async function lockRequest(action, extra = {}) {
  try {
    const res = await fetch(LOCK_URL, {
      method: 'POST',
      headers: authHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ action, sessionId, userName: currentUserName, ...extra })
    });
    if (res.status === 401) {
      // Don't fire the global handler from background heartbeats — that
      // would spam the alert. Caller decides what to do with { ok: false,
      // unauthorized: true }.
      return { ok: false, unauthorized: true };
    }
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch {
    return { ok: false, error: 'network' };
  }
}

function tryAcquireLock(userName) {
  currentUserName = userName;
  return lockRequest('acquire', { userName });
}
function refreshLock() {
  return lockRequest('refresh');
}
function releaseLock() {
  return lockRequest('release');
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(async () => {
    const r = await refreshLock();
    // Heartbeat is the canary that catches token expiry while idle in
    // edit mode. If we hit a 401, surface it once and bail out.
    if (r && r.unauthorized) {
      stopHeartbeat();
      handleAuthExpired('Lock heartbeat rejected — token expired.');
    }
  }, LOCK_HEARTBEAT_MS);
}
function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

// ---- Live "someone is editing" banner via polling -------------------------
async function pollLockStatus() {
  let data;
  try {
    const res = await fetch(LOCK_URL, { cache: 'no-store' });
    if (!res.ok) return;
    data = await res.json();
  } catch {
    return;
  }
  const banner = document.getElementById('hg-lock-banner');
  const link = document.querySelector('.hg-edit-footer-link');
  if (!banner) return;
  const heldByOther = data.active && data.sessionId !== sessionId;
  if (heldByOther) {
    banner.textContent = `${data.userName || 'Someone'} is editing the site right now…`;
    banner.style.display = 'block';
    if (link && !isEditing) {
      link.classList.add('hg-disabled');
      link.title = `${data.userName || 'Someone'} is currently editing.`;
    }
  } else {
    banner.style.display = 'none';
    if (link && !isEditing) {
      link.classList.remove('hg-disabled');
      link.title = 'Sign in to edit this site';
    }
  }
}

function startPolling() {
  if (pollTimer) return;
  pollLockStatus();
  pollTimer = setInterval(pollLockStatus, LOCK_POLL_MS);
}

// ---- Edit mode ------------------------------------------------------------
let isEditing = false;
const originalContent = {};

function enterEditMode(userName) {
  const editables = collectAllTextEditables();
  editables.forEach(el => {
    originalContent[el.dataset.editKey] = el.innerHTML;
    el.setAttribute('contenteditable', 'true');
    el.classList.add('hg-editable');
    el.addEventListener('focus', showFieldResetFor);
    el.addEventListener('click', showFieldResetFor);
  });
  const images = collectEditableImages();
  images.forEach(img => {
    img.classList.add('hg-img-editable');
    img.setAttribute('title', 'Click to replace this image');
    img.addEventListener('click', onImageClick);
  });
  document.addEventListener('click', blockLinkNav, false);
  isEditing = true;
  const saveBar = document.getElementById('hg-save-bar');
  if (saveBar) saveBar.classList.add('active');
  const nameEl = document.getElementById('hg-save-bar-name');
  if (nameEl) nameEl.textContent = userName;
  const link = document.querySelector('.hg-edit-footer-link');
  if (link) link.style.visibility = 'hidden';
  ensureFieldResetPopover();
  startHeartbeat();
}

function exitEditMode() {
  document.querySelectorAll('.hg-editable').forEach(el => {
    el.setAttribute('contenteditable', 'false');
    el.classList.remove('hg-editable');
    el.removeEventListener('focus', showFieldResetFor);
    el.removeEventListener('click', showFieldResetFor);
  });
  document.querySelectorAll('.hg-img-editable').forEach(img => {
    img.classList.remove('hg-img-editable');
    img.removeAttribute('title');
    img.removeEventListener('click', onImageClick);
  });
  hideFieldResetPopover();
  document.removeEventListener('click', blockLinkNav, false);
  isEditing = false;
  const saveBar = document.getElementById('hg-save-bar');
  if (saveBar) saveBar.classList.remove('active');
  const link = document.querySelector('.hg-edit-footer-link');
  if (link) link.style.visibility = '';
  stopHeartbeat();
}

// Prevent link navigation while editing so users can click inside CTAs
// and nav items to edit the text without the browser following the link.
function blockLinkNav(e) {
  const a = e.target.closest && e.target.closest('a');
  if (a) e.preventDefault();
}

// ---- Image upload flow ----------------------------------------------------
function onImageClick(e) {
  e.preventDefault();
  e.stopPropagation();
  const img = e.currentTarget;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (file) await uploadImage(img, file);
    input.remove();
  });
  document.body.appendChild(input);
  input.click();
}

async function uploadImage(img, file) {
  const prevOpacity = img.style.opacity;
  const prevFilter = img.style.filter;
  img.style.opacity = '0.4';
  img.style.filter = 'blur(1px)';
  try {
    const form = new FormData();
    form.append('page', pageKey);
    form.append('editKey', img.dataset.editImgKey);
    form.append('file', file);
    const res = await fetch(IMAGE_URL, {
      method: 'POST',
      headers: authHeaders(),
      body: form
    });
    if (res.status === 401) {
      handleAuthExpired('Image upload was rejected — token expired.');
      return;
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${txt}`);
    }
    const data = await res.json();
    img.src = data.url;
  } catch (err) {
    alert('Image upload failed: ' + (err && err.message ? err.message : err));
  } finally {
    img.style.opacity = prevOpacity;
    img.style.filter = prevFilter;
  }
}

async function saveChanges() {
  const editables = collectAllTextEditables();
  const updates = {};
  editables.forEach(el => {
    const key = el.dataset.editKey;
    const newVal = sanitizeOverrideHTML(el.innerHTML);
    if (newVal !== originalContent[key]) updates[key] = newVal;
  });
  const saveBtn = document.getElementById('hg-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
  try {
    if (Object.keys(updates).length > 0) {
      const res = await fetch(CONTENT_URL, {
        method: 'POST',
        headers: authHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ page: pageKey, updates })
      });
      if (res.status === 401) {
        handleAuthExpired(
          'Your changes were NOT saved. Sign in again and re-apply them.'
        );
        return;
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${txt}`);
      }
    }
    await releaseLock();
    exitEditMode();
  } catch (err) {
    alert('Save failed: ' + (err && err.message ? err.message : err));
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
  }
}

// Floating "Reset this field" popover. One instance for the whole tab.
// Positioned above the currently-focused editable element so editors
// can wipe a single blob entry instead of the whole page. Returns the
// DOM node so callers can show/hide/move it without re-creating it.
function ensureFieldResetPopover() {
  let pop = document.getElementById('hg-field-reset');
  if (pop) return pop;
  pop = document.createElement('button');
  pop.id = 'hg-field-reset';
  pop.type = 'button';
  pop.textContent = '↺ Reset this field';
  pop.title = 'Wipe the in-editor change for just this element';
  pop.addEventListener('mousedown', e => e.preventDefault()); // keep focus
  pop.addEventListener('click', resetFieldFromPopover);
  document.body.appendChild(pop);
  return pop;
}

function hideFieldResetPopover() {
  const pop = document.getElementById('hg-field-reset');
  if (pop) { pop.style.display = 'none'; pop.dataset.targetKey = ''; }
}

function showFieldResetFor(e) {
  const el = e.currentTarget;
  if (!el || !el.dataset.editKey) return;
  const pop = ensureFieldResetPopover();
  pop.dataset.targetKey = el.dataset.editKey;
  const rect = el.getBoundingClientRect();
  pop.style.display = 'block';
  pop.style.position = 'absolute';
  // Park it just above the element's top-right corner, accounting for
  // scroll. Falls below if there's no room above.
  const top = window.scrollY + rect.top - 32;
  pop.style.top = (top > window.scrollY ? top : window.scrollY + rect.bottom + 6) + 'px';
  pop.style.left = (window.scrollX + Math.max(rect.right - 160, rect.left)) + 'px';
}

async function resetFieldFromPopover() {
  const pop = document.getElementById('hg-field-reset');
  if (!pop || !pop.dataset.targetKey) return;
  const key = pop.dataset.targetKey;
  if (!confirm(`Wipe the in-editor change for "${key}"?\n\nThe original page content for just this element will come back on reload. Other edits on this page stay.`)) return;
  pop.disabled = true;
  pop.textContent = 'Resetting…';
  try {
    const res = await fetch(`${CONTENT_URL}?page=${encodeURIComponent(pageKey)}&key=${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (res.status === 401) {
      handleAuthExpired('Reset failed — please sign in again.');
      return;
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${txt}`);
    }
    await releaseLock().catch(() => {});
    window.location.reload();
  } catch (err) {
    alert('Reset failed: ' + (err && err.message ? err.message : err));
    pop.disabled = false;
    pop.textContent = '↺ Reset this field';
  }
}

// Wipe ALL blob overrides for the current page so the original static
// HTML wins. Use when stale/corrupt entries from earlier edits keep
// leaking back into the rendered DOM and the only recovery is a clean
// slate. Confirms before doing it; reloads the page on success so the
// user sees the result immediately.
async function resetPageOverrides() {
  const msg = 'Wipe ALL in-editor changes for "' + pageKey + '"?\n\n'
    + 'This deletes every text and image override stored for this page. '
    + 'The original HTML will show on reload. This cannot be undone.';
  if (!confirm(msg)) return;
  const resetBtn = document.getElementById('hg-reset-btn');
  if (resetBtn) { resetBtn.disabled = true; resetBtn.textContent = 'Resetting…'; }
  try {
    const res = await fetch(`${CONTENT_URL}?page=${encodeURIComponent(pageKey)}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (res.status === 401) {
      handleAuthExpired('Reset failed — please sign in again.');
      return;
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${txt}`);
    }
    await releaseLock().catch(() => {});
    window.location.reload();
  } catch (err) {
    alert('Reset failed: ' + (err && err.message ? err.message : err));
    if (resetBtn) { resetBtn.disabled = false; resetBtn.textContent = 'Reset page'; }
  }
}

function cancelEdit() {
  document.querySelectorAll('.hg-editable').forEach(el => {
    const key = el.dataset.editKey;
    if (key in originalContent) el.innerHTML = originalContent[key];
  });
  releaseLock();
  exitEditMode();
}

// ---- Password modal flow --------------------------------------------------
// One small inline modal asks for the shared editor password and POSTs
// it to /.netlify/functions/otp. The function returns { ok: true, token }
// on a match. The token is stashed in sessionStorage and sent on every
// write via the x-hg-token header.

function buildAuthModal() {
  // Reuse if already mounted (e.g. token expired and we're re-opening).
  let modal = document.getElementById('hg-otp-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'hg-otp-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'hg-otp-title');
  modal.innerHTML = `
    <div class="hg-otp-backdrop" data-hg-close="1"></div>
    <div class="hg-otp-card">
      <button type="button" class="hg-otp-close" data-hg-close="1" aria-label="Close">×</button>
      <h3 id="hg-otp-title">Editor sign-in</h3>
      <p class="hg-otp-msg" id="hg-otp-msg">Enter the editor password to continue.</p>

      <div class="hg-otp-step" data-step="password">
        <label for="hg-otp-password">Password</label>
        <input type="password" id="hg-otp-password" autocomplete="current-password" />
        <div class="hg-otp-actions">
          <button type="button" id="hg-otp-cancel">Cancel</button>
          <button type="button" id="hg-otp-signin">Sign in</button>
        </div>
      </div>

      <p class="hg-otp-foot">Editing is restricted to authorized users.</p>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function setOtpMsg(modal, text, kind) {
  const m = modal.querySelector('#hg-otp-msg');
  if (!m) return;
  m.textContent = text;
  m.dataset.kind = kind || '';
}

function closeAuthModal() {
  const modal = document.getElementById('hg-otp-modal');
  if (modal) modal.remove();
}

// Returns { name } on success, null if the user closed the modal.
function openAuthModal() {
  return new Promise(resolve => {
    const modal = buildAuthModal();
    modal.classList.add('open');

    const pwInput = modal.querySelector('#hg-otp-password');
    const signinBtn = modal.querySelector('#hg-otp-signin');
    const cancelBtn = modal.querySelector('#hg-otp-cancel');

    setTimeout(() => pwInput && pwInput.focus(), 0);

    const close = (result) => {
      modal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onEsc);
      closeAuthModal();
      resolve(result);
    };
    const onBackdrop = (e) => {
      if (e.target && e.target.dataset && e.target.dataset.hgClose === '1') close(null);
    };
    const onEsc = (e) => { if (e.key === 'Escape') close(null); };
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onEsc);

    cancelBtn.addEventListener('click', () => close(null));

    signinBtn.addEventListener('click', async () => {
      const password = pwInput.value || '';
      if (!password) {
        setOtpMsg(modal, 'Please enter the password.', 'err');
        return;
      }
      signinBtn.disabled = true;
      signinBtn.textContent = 'Signing in…';
      try {
        const res = await fetch(OTP_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data && data.ok && data.token) {
          setToken(data.token);
          close({ name: 'Editor' });
        } else {
          setOtpMsg(modal, 'Incorrect password.', 'err');
        }
      } catch (err) {
        setOtpMsg(modal,
          'Sign-in failed: ' + (err && err.message ? err.message : err),
          'err'
        );
      } finally {
        signinBtn.disabled = false;
        signinBtn.textContent = 'Sign in';
      }
    });

    pwInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); signinBtn.click(); }
    });
  });
}

// ---- Edit link click ------------------------------------------------------
async function onEditClick(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  if (isEditing) return;

  // If we already have a token from earlier this tab session, skip auth.
  let identity = null;
  if (getToken()) {
    identity = { name: 'Editor' };
  } else {
    identity = await openAuthModal();
    if (!identity) return; // user cancelled
  }

  // Lazy-mount the heavy save-bar UI now that we know an admin is here.
  // For first-time auth in this tab, this is what brings #hg-editor-ui
  // into the DOM at all -- anonymous visitors never see it.
  collectAllTextEditables();
  mountSaveBarUI();

  try {
    const result = await tryAcquireLock(identity.name);
    if (!result.ok) {
      if (result.unauthorized) {
        // Token was rejected by the lock function — treat as fresh expiry.
        handleAuthExpired('Could not start a new lock — token rejected.');
        return;
      }
      if (result.holder) {
        alert(`${result.holder} is currently editing. Please try again in a few minutes.`);
      } else {
        alert('Could not start editing. Check your connection and try again.');
      }
      return;
    }
    enterEditMode(identity.name);
  } catch (err) {
    alert('Could not start editing: ' + (err && err.message ? err.message : err));
  }
}

// Strip any editor-chrome attributes that may have ended up in the static
// HTML via a stale bake. Anonymous visitors should never see contenteditable
// or hg-editable nodes; collectAllTextEditables() will re-issue clean
// data-edit-keys positionally on its next pass.
function neutralizeStaticEditorChrome() {
  const ui = document.getElementById('hg-editor-ui');
  document.querySelectorAll('[contenteditable]').forEach(el => {
    if (!ui || !ui.contains(el)) el.removeAttribute('contenteditable');
  });
  document.querySelectorAll('.hg-editable').forEach(el => el.classList.remove('hg-editable'));
  document.querySelectorAll('[data-edit-key]').forEach(el => el.removeAttribute('data-edit-key'));
  ['data-start','data-end','data-is-only-node','data-is-last-node'].forEach(attr => {
    document.querySelectorAll('[' + attr + ']').forEach(el => el.removeAttribute(attr));
  });
}

// ---- Mount footer "edit" link + save bar ----------------------------------

// Whether the heavy save-bar UI has been injected into the DOM. Anonymous
// visitors never trigger this; it only runs after a successful auth or
// on a tab that already has a valid token from earlier.
let saveBarMounted = false;

function mountSaveBarUI() {
  if (saveBarMounted) return;
  saveBarMounted = true;
  // Save bar + lock banner (no floating Edit button anymore).
  const wrap = document.createElement('div');
  wrap.id = 'hg-editor-ui';
  wrap.innerHTML = `
    <div id="hg-lock-banner"></div>
    <div id="hg-save-bar">
      <span id="hg-save-bar-msg">Editing as <b id="hg-save-bar-name"></b> — click any text to change it.</span>
      <span>
        <button id="hg-reset-btn" type="button" title="Wipe all in-editor changes for this page so the original HTML wins">Reset page</button>
        <button id="hg-cancel-btn" type="button">Cancel</button>
        <button id="hg-save-btn" type="button">Save</button>
      </span>
    </div>
  `;
  document.body.appendChild(wrap);
  const saveBtn = document.getElementById('hg-save-btn');
  const cancelBtn = document.getElementById('hg-cancel-btn');
  const resetBtn = document.getElementById('hg-reset-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveChanges);
  if (resetBtn) resetBtn.addEventListener('click', resetPageOverrides);
  if (cancelBtn) cancelBtn.addEventListener('click', cancelEdit);
  startPolling();
}

// Inject a discreet "edit" text link into the footer-bottom of the current
// page. Falls back to appending into <footer> if the expected structure
// isn't found (e.g. on a page that was edited to drop .footer-bottom).
function mountFooterEditLink() {
  // Don't double-mount across hot-reloads.
  if (document.querySelector('.hg-edit-footer-link')) return;

  // Anonymous visitors don't see this link unless they explicitly add
  // `#edit` to the URL. Keeps the editor entry point out of the public
  // footer while still letting admins find it (just remember the hash).
  // If already authenticated this tab, show the link regardless so the
  // edit workflow stays seamless.
  const hashRequested = window.location.hash === '#edit';
  if (!hashRequested && !getToken()) return;

  const link = document.createElement('a');
  link.href = '#';
  link.className = 'hg-edit-footer-link';
  link.textContent = 'edit';
  link.setAttribute('rel', 'nofollow');
  link.setAttribute('title', 'Sign in to edit this site');
  link.addEventListener('click', onEditClick);

  // Preferred home: the right-hand div inside .footer-bottom, next to
  // "Privacy Practices · No Surprises Act". Separator matches existing
  // markup style (two non-breaking spaces around a middle dot).
  const footerBottom = document.querySelector('footer .footer-bottom');
  if (footerBottom) {
    const right = footerBottom.querySelector('div:last-child');
    if (right) {
      const sep = document.createTextNode('  ·  ');
      right.appendChild(sep);
      right.appendChild(link);
      return;
    }
    // Fallback: tack onto the footer-bottom itself.
    footerBottom.appendChild(link);
    return;
  }

  // Hard fallback: any <footer>.
  const footer = document.querySelector('footer');
  if (footer) footer.appendChild(link);
}

// ---- Release lock if the editor navigates away ----------------------------
window.addEventListener('beforeunload', () => {
  if (isEditing) {
    // Fire-and-forget; sendBeacon so it survives unload.
    // We can't set custom headers on sendBeacon, so we pass the token in
    // the body and let lock.mjs ignore it (the lock will time out anyway).
    try {
      const body = JSON.stringify({ action: 'release', sessionId, token: getToken() });
      navigator.sendBeacon?.(
        LOCK_URL,
        new Blob([body], { type: 'application/json' })
      );
    } catch {}
  }
});

// ---- Init -----------------------------------------------------------------
(async function init() {
  // Always-on for every visitor: neutralize any leaked editor chrome in
  // static HTML, fetch blob overrides and apply (sanitized), and mount
  // the discreet footer "edit" link so admins can sign in.
  neutralizeStaticEditorChrome();
  await loadOverrides();
  mountFooterEditLink();

  // Save bar + lock-polling only mount for visitors who already hold a
  // valid token from this tab session. Fresh anonymous visitors get
  // none of that injected into their DOM.
  if (getToken()) {
    collectAllTextEditables();
    mountSaveBarUI();
  }
})();
