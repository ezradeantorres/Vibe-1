// ============================================================
//  HIDDEN GEM HEALING — IN-PAGE EDITOR (Netlify Blobs backend)
// ============================================================
//  Loads saved text overrides from a Netlify Function on every
//  page view, and lets any visitor edit any text block in place
//  with a cross-tab "someone is editing" lock.
// ============================================================

const CONTENT_URL = '/.netlify/functions/content';
const LOCK_URL = '/.netlify/functions/lock';
const IMAGE_URL = '/.netlify/functions/image';

const LOCK_TIMEOUT_MS = 10 * 60 * 1000;   // must match lock.mjs
const LOCK_HEARTBEAT_MS = 30 * 1000;
const LOCK_POLL_MS = 5 * 1000;            // how often we poll the lock status

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

// ---- Lock state -----------------------------------------------------------
const sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
let heartbeatTimer = null;
let pollTimer = null;
let currentUserName = '';

async function lockRequest(action, extra = {}) {
  try {
    const res = await fetch(LOCK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, sessionId, userName: currentUserName, ...extra })
    });
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
  heartbeatTimer = setInterval(refreshLock, LOCK_HEARTBEAT_MS);
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
  const btn = document.getElementById('hg-edit-btn');
  if (!banner || !btn) return;
  const heldByOther = data.active && data.sessionId !== sessionId;
  if (heldByOther) {
    banner.textContent = `✏️  ${data.userName || 'Someone'} is editing the site right now…`;
    banner.style.display = 'block';
    if (!isEditing) btn.disabled = true;
  } else {
    banner.style.display = 'none';
    if (!isEditing) btn.disabled = false;
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
  document.getElementById('hg-save-bar').classList.add('active');
  document.getElementById('hg-save-bar-name').textContent = userName;
  document.getElementById('hg-edit-btn').style.display = 'none';
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
  document.getElementById('hg-save-bar').classList.remove('active');
  document.getElementById('hg-edit-btn').style.display = '';
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
    const res = await fetch(IMAGE_URL, { method: 'POST', body: form });
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
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  try {
    if (Object.keys(updates).length > 0) {
      const res = await fetch(CONTENT_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ page: pageKey, updates })
      });
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
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
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

// ---- Edit button click ----------------------------------------------------
async function onEditClick() {
  const savedName = localStorage.getItem('hgEditorName') || '';
  const name = window.prompt('Your name (so others know who is editing):', savedName);
  if (!name) return;
  localStorage.setItem('hgEditorName', name);

  try {
    const result = await tryAcquireLock(name);
    if (!result.ok) {
      if (result.holder) {
        alert(`${result.holder} is currently editing. Please try again in a few minutes.`);
      } else {
        alert('Could not start editing. Check your connection and try again.');
      }
      return;
    }
    enterEditMode(name);
  } catch (err) {
    alert('Could not start editing: ' + (err && err.message ? err.message : err));
  }
}

// ---- Mount floating UI ----------------------------------------------------
function mountUI() {
  const wrap = document.createElement('div');
  wrap.id = 'hg-editor-ui';
  wrap.innerHTML = `
    <div id="hg-lock-banner"></div>
    <button id="hg-edit-btn" type="button" title="Edit this site">✏️  Edit</button>
    <div id="hg-save-bar">
      <span id="hg-save-bar-msg">Editing as <b id="hg-save-bar-name"></b> — click any text to change it.</span>
      <span>
        <button id="hg-cancel-btn" type="button">Cancel</button>
        <button id="hg-save-btn" type="button">Save</button>
      </span>
    </div>
  `;
  document.body.appendChild(wrap);
  document.getElementById('hg-edit-btn').addEventListener('click', onEditClick);
  document.getElementById('hg-save-btn').addEventListener('click', saveChanges);
  document.getElementById('hg-cancel-btn').addEventListener('click', cancelEdit);
}

// ---- Release lock if the editor navigates away ----------------------------
window.addEventListener('beforeunload', () => {
  if (isEditing) {
    // Fire-and-forget; sendBeacon so it survives unload
    try {
      const body = JSON.stringify({ action: 'release', sessionId });
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
