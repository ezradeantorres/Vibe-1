// GET  /.netlify/functions/lock              → { active, userName, sessionId, ts }
// POST /.netlify/functions/lock              → { action, sessionId, userName }
//      action = "acquire" | "refresh" | "release"
//
// GETs are public (the live "someone is editing" banner polls this on
// every page). POSTs require a valid `x-hg-token` header issued by
// /.netlify/functions/otp.

import { getStore } from '@netlify/blobs';

const LOCK_KEY = 'editor';
const LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const TOKEN_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours; must match otp.mjs

export default async (req) => {
  const store = getStore('site-locks');

  if (req.method === 'GET') {
    const lock = (await store.get(LOCK_KEY, { type: 'json', consistency: 'strong' })) || {};
    return json(publicLock(lock));
  }

  if (req.method === 'POST') {
    const authed = await checkToken(req);
    if (!authed.ok) return json({ error: 'unauthorized' }, 401);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
    const { action, sessionId, userName } = body || {};
    if (!action || !sessionId) return json({ error: 'missing action or sessionId' }, 400);

    const current = (await store.get(LOCK_KEY, { type: 'json', consistency: 'strong' })) || {};
    const now = Date.now();
    const fresh = current.sessionId && (now - (current.ts || 0) < LOCK_TIMEOUT_MS);

    if (action === 'acquire') {
      if (fresh && current.sessionId !== sessionId) {
        return json({ ok: false, holder: current.userName || 'Someone' });
      }
      await store.setJSON(LOCK_KEY, { sessionId, userName: userName || '', ts: now });
      return json({ ok: true });
    }

    if (action === 'refresh') {
      if (current.sessionId !== sessionId) {
        return json({ ok: false, reason: 'not-holder' });
      }
      await store.setJSON(LOCK_KEY, { sessionId, userName: userName || current.userName || '', ts: now });
      return json({ ok: true });
    }

    if (action === 'release') {
      if (current.sessionId === sessionId) {
        await store.setJSON(LOCK_KEY, { sessionId: null, userName: null, ts: 0 });
      }
      return json({ ok: true });
    }

    return json({ error: 'unknown action' }, 400);
  }

  return json({ error: 'method not allowed' }, 405);
};

async function checkToken(req) {
  const token = req.headers.get('x-hg-token');
  if (!token || !/^[a-f0-9]{32}$/.test(token)) return { ok: false };
  const otpStore = getStore('site-otp');
  const rec = await otpStore.get(`token:${token}`, { type: 'json', consistency: 'strong' });
  if (!rec || !rec.ts) return { ok: false };
  if (Date.now() - rec.ts > TOKEN_TTL_MS) return { ok: false };
  return { ok: true };
}

function publicLock(lock) {
  const fresh = lock.sessionId && (Date.now() - (lock.ts || 0) < LOCK_TIMEOUT_MS);
  if (!fresh) return { active: false };
  return {
    active: true,
    userName: lock.userName || 'Someone',
    sessionId: lock.sessionId,
    ts: lock.ts
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    }
  });
}
