// ============================================================
//  HIDDEN GEM HEALING — IN-PAGE EDITOR (Netlify Blobs backend)
// ============================================================
//  Loads saved text overrides from a Netlify Function on every
//  page view (public read), and gates editing behind an email OTP
//  served by /.netlify/functions/otp. A successful verify returns
//  a 32-hex token which the editor stashes in sessionStorage and
//  attaches as `x-hg-token` on every write call.
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
  '.faq-q', '.faq-a',
  'footer h4', 'footer p', 'footer a',
  'nav a', '.nav-links a'
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
      if (typeof data[key] === 'string') el.innerHTML = data[key];
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
  startHeartbeat();
}

function exitEditMode() {
  document.querySelectorAll('.hg-editable').forEach(el => {
    el.setAttribute('contenteditable', 'false');
    el.classList.remove('hg-editable');
  });
  document.querySelectorAll('.hg-img-editable').forEach(img => {
    img.classList.remove('hg-img-editable');
    img.removeAttribute('title');
    img.removeEventListener('click', onImageClick);
  });
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
    const newVal = el.innerHTML;
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

function cancelEdit() {
  document.querySelectorAll('.hg-editable').forEach(el => {
    const key = el.dataset.editKey;
    if (key in originalContent) el.innerHTML = originalContent[key];
  });
  releaseLock();
  exitEditMode();
}

// ---- OTP modal flow -------------------------------------------------------
// One small inline modal handles both steps:
//   1. ask for email, POST {action:'request', email}
//   2. ask for the 6-digit code, POST {action:'verify', email, code}
// On success we stash the token in sessionStorage and continue into
// tryAcquireLock + enterEditMode.

function buildOtpModal() {
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
      <p class="hg-otp-msg" id="hg-otp-msg">Enter your email to receive a sign-in code.</p>

      <div class="hg-otp-step" data-step="email">
        <label for="hg-otp-email">Email</label>
        <input type="email" id="hg-otp-email" autocomplete="email" placeholder="you@example.com" />
        <div class="hg-otp-actions">
          <button type="button" id="hg-otp-cancel">Cancel</button>
          <button type="button" id="hg-otp-send">Send code</button>
        </div>
      </div>

      <div class="hg-otp-step" data-step="code" hidden>
        <label for="hg-otp-code">6-digit code</label>
        <input type="text" id="hg-otp-code" inputmode="numeric" autocomplete="one-time-code"
               pattern="[0-9]{6}" maxlength="6" placeholder="123456" />
        <div class="hg-otp-actions">
          <button type="button" id="hg-otp-back">Back</button>
          <button type="button" id="hg-otp-verify">Verify &amp; edit</button>
        </div>
      </div>

      <p class="hg-otp-foot">Editing is restricted to authorized accounts.</p>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function showStep(modal, step) {
  modal.querySelectorAll('.hg-otp-step').forEach(s => {
    s.hidden = s.dataset.step !== step;
  });
  const focus = step === 'email'
    ? modal.querySelector('#hg-otp-email')
    : modal.querySelector('#hg-otp-code');
  if (focus) setTimeout(() => focus.focus(), 0);
}

function setOtpMsg(modal, text, kind) {
  const m = modal.querySelector('#hg-otp-msg');
  if (!m) return;
  m.textContent = text;
  m.dataset.kind = kind || '';
}

function closeOtpModal() {
  const modal = document.getElementById('hg-otp-modal');
  if (modal) modal.remove();
}

// Returns { email, name } on success, null if the user closed the modal.
function openOtpModal() {
  return new Promise(resolve => {
    const modal = buildOtpModal();
    modal.classList.add('open');
    showStep(modal, 'email');

    const emailInput = modal.querySelector('#hg-otp-email');
    const codeInput = modal.querySelector('#hg-otp-code');
    const sendBtn = modal.querySelector('#hg-otp-send');
    const verifyBtn = modal.querySelector('#hg-otp-verify');
    const cancelBtn = modal.querySelector('#hg-otp-cancel');
    const backBtn = modal.querySelector('#hg-otp-back');

    const savedEmail = (() => {
      try { return localStorage.getItem('hgEditorEmail') || ''; } catch { return ''; }
    })();
    if (savedEmail) emailInput.value = savedEmail;

    let currentEmail = '';

    const close = (result) => {
      modal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onEsc);
      closeOtpModal();
      resolve(result);
    };
    const onBackdrop = (e) => {
      if (e.target && e.target.dataset && e.target.dataset.hgClose === '1') close(null);
    };
    const onEsc = (e) => { if (e.key === 'Escape') close(null); };
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onEsc);

    cancelBtn.addEventListener('click', () => close(null));

    sendBtn.addEventListener('click', async () => {
      const email = (emailInput.value || '').trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setOtpMsg(modal, 'Please enter a valid email.', 'err');
        return;
      }
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending…';
      setOtpMsg(modal, 'Sending code…', '');
      try {
        const res = await fetch(OTP_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'request', email })
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status} ${txt}`);
        }
        currentEmail = email;
        try { localStorage.setItem('hgEditorEmail', email); } catch {}
        setOtpMsg(modal,
          'If your address is authorized, a 6-digit code has been emailed to you. It expires in 10 minutes.',
          'ok'
        );
        showStep(modal, 'code');
      } catch (err) {
        setOtpMsg(modal,
          'Could not send code: ' + (err && err.message ? err.message : err),
          'err'
        );
      } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send code';
      }
    });

    backBtn.addEventListener('click', () => {
      setOtpMsg(modal, 'Enter your email to receive a sign-in code.', '');
      showStep(modal, 'email');
    });

    verifyBtn.addEventListener('click', async () => {
      const code = (codeInput.value || '').trim();
      if (!/^\d{6}$/.test(code)) {
        setOtpMsg(modal, 'Enter the 6-digit code from your email.', 'err');
        return;
      }
      verifyBtn.disabled = true;
      verifyBtn.textContent = 'Verifying…';
      try {
        const res = await fetch(OTP_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'verify', email: currentEmail, code })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data && data.ok && data.token) {
          setToken(data.token);
          // Derive a display name from the email so the lock banner has
          // something nicer than the full address to show others.
          const name = currentEmail.split('@')[0] || 'Editor';
          close({ email: currentEmail, name });
        } else if (data && data.expired) {
          setOtpMsg(modal,
            'That code has expired. Click "Back" and request a new one.',
            'err'
          );
        } else {
          setOtpMsg(modal,
            'Incorrect or expired code. Double-check the email and try again.',
            'err'
          );
        }
      } catch (err) {
        setOtpMsg(modal,
          'Verification failed: ' + (err && err.message ? err.message : err),
          'err'
        );
      } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify & edit';
      }
    });

    // Enter-key shortcuts
    emailInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); sendBtn.click(); }
    });
    codeInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); verifyBtn.click(); }
    });
  });
}

// ---- Edit link click ------------------------------------------------------
async function onEditClick(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  if (isEditing) return;

  // If we already have a token from earlier this tab session, skip OTP.
  let identity = null;
  if (getToken()) {
    const savedEmail = (() => {
      try { return localStorage.getItem('hgEditorEmail') || ''; } catch { return ''; }
    })();
    identity = { email: savedEmail, name: (savedEmail.split('@')[0] || 'Editor') };
  } else {
    identity = await openOtpModal();
    if (!identity) return; // user cancelled
  }

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

// ---- Mount footer "edit" link + save bar ----------------------------------
function mountUI() {
  // Save bar + lock banner (no floating Edit button anymore).
  const wrap = document.createElement('div');
  wrap.id = 'hg-editor-ui';
  wrap.innerHTML = `
    <div id="hg-lock-banner"></div>
    <div id="hg-save-bar">
      <span id="hg-save-bar-msg">Editing as <b id="hg-save-bar-name"></b> — click any text to change it.</span>
      <span>
        <button id="hg-cancel-btn" type="button">Cancel</button>
        <button id="hg-save-btn" type="button">Save</button>
      </span>
    </div>
  `;
  document.body.appendChild(wrap);
  const saveBtn = document.getElementById('hg-save-btn');
  const cancelBtn = document.getElementById('hg-cancel-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveChanges);
  if (cancelBtn) cancelBtn.addEventListener('click', cancelEdit);

  mountFooterEditLink();
}

// Inject a discreet "edit" text link into the footer-bottom of the current
// page. Falls back to appending into <footer> if the expected structure
// isn't found (e.g. on a page that was edited to drop .footer-bottom).
function mountFooterEditLink() {
  // Don't double-mount across hot-reloads.
  if (document.querySelector('.hg-edit-footer-link')) return;

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
  collectAllTextEditables();
  mountUI();
  startPolling();
  await loadOverrides();
})();
