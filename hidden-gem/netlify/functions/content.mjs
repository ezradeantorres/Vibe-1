// GET  /.netlify/functions/content?page=home   → { "home:0": "...", ... }
// POST /.netlify/functions/content              → { page, updates } → merges into blob
//
// GETs are public (visitors load overrides on every page view). POSTs
// require a valid `x-hg-token` header issued by /.netlify/functions/otp.

import { getStore } from '@netlify/blobs';

const TOKEN_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours; must match otp.mjs

export default async (req) => {
  const store = getStore('site-content');

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const page = url.searchParams.get('page');
    if (!page) return json({ error: 'missing page param' }, 400);
    const data = (await store.get(page, { type: 'json', consistency: 'strong' })) || {};
    return json(data);
  }

  if (req.method === 'POST') {
    const authed = await checkToken(req);
    if (!authed.ok) return json({ error: 'unauthorized' }, 401);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
    const { page, updates } = body || {};
    if (!page || !updates || typeof updates !== 'object') {
      return json({ error: 'missing page or updates' }, 400);
    }
    const existing = (await store.get(page, { type: 'json', consistency: 'strong' })) || {};
    const merged = { ...existing, ...updates };
    await store.setJSON(page, merged);
    return json({ ok: true, fields: Object.keys(updates).length });
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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    }
  });
}
