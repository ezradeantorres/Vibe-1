// GET  /.netlify/functions/content?page=home   → { "home:0": "...", ... }
// POST /.netlify/functions/content              → { page, updates } → merges into blob

import { getStore } from '@netlify/blobs';

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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    }
  });
}
