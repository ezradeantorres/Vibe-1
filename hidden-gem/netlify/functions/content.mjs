// GET    /.netlify/functions/content?page=home              → { "home:0": "...", ... }
// POST   /.netlify/functions/content                         → { page, updates } → merges into blob
// DELETE /.netlify/functions/content?page=home               → wipes ALL overrides for that page
// DELETE /.netlify/functions/content?page=home&key=home:5    → wipes ONE override; rest of page preserved
//
// GETs are public (every visitor loads overrides on page view). POSTs
// and DELETEs require an `x-hg-token` header containing a valid token
// issued by /.netlify/functions/otp; otherwise we 401.

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
    if (!(await checkToken(req))) return json({ error: 'unauthorized' }, 401);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
    const { page, updates } = body || {};
    if (!page || !updates || typeof updates !== 'object') {
      return json({ error: 'missing page or updates' }, 400);
    }
    const existing = (await store.get(page, { type: 'json', consistency: 'strong' })) || {};
    const merged = { ...existing, ...updates };
    await store.setJSON(page, merged);
    triggerBake('save:' + page).catch(() => {});
    return json({ ok: true, fields: Object.keys(updates).length });
  }

  if (req.method === 'DELETE') {
    if (!(await checkToken(req))) return json({ error: 'unauthorized' }, 401);
    const url = new URL(req.url);
    const page = url.searchParams.get('page');
    if (!page) return json({ error: 'missing page param' }, 400);

    const singleKey = url.searchParams.get('key');
    if (singleKey) {
      // Single-key delete: merge a "minus this key" update into the
      // existing blob. Leaves all other entries on the page untouched.
      const existing = (await store.get(page, { type: 'json', consistency: 'strong' })) || {};
      if (!(singleKey in existing)) {
        return json({ ok: true, page, key: singleKey, noop: true });
      }
      delete existing[singleKey];
      await store.setJSON(page, existing);
      triggerBake('reset-field:' + page + ':' + singleKey).catch(() => {});
      return json({ ok: true, page, key: singleKey, cleared: true });
    }

    await store.delete(page);
    triggerBake('reset-page:' + page).catch(() => {});
    return json({ ok: true, page, cleared: true });
  }

  return json({ error: 'method not allowed' }, 405);
};

async function checkToken(req) {
  const token = req.headers.get('x-hg-token');
  if (!token || !/^[a-f0-9]{32}$/.test(token)) return false;
  const otpStore = getStore('site-otp');
  const rec = await otpStore.get(`token:${token}`, { type: 'json', consistency: 'strong' });
  if (!rec || !rec.ts) return false;
  if (Date.now() - rec.ts > TOKEN_TTL_MS) return false;
  return true;
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

// Fire the GitHub Actions bake-hidden-gem workflow so the edit we just
// saved/cleared gets baked into static HTML within ~60s and propagates
// to the deployed site. Silent no-op if GH_BAKE_PAT isn't set, so the
// editor still works end-to-end before the env var is configured.
//
// Requires a GitHub Personal Access Token (classic) with `repo` + `workflow`
// scopes, OR a fine-grained token with `actions: write` on the repo,
// stored as the Netlify env var GH_BAKE_PAT.
// Optional overrides: GH_OWNER, GH_REPO (defaults: ezradeantorres / Vibe-1).
async function triggerBake(reason) {
  const token = process.env.GH_BAKE_PAT;
  if (!token) return;
  const owner = process.env.GH_OWNER || 'ezradeantorres';
  const repo = process.env.GH_REPO || 'Vibe-1';
  try {
    const r = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/bake-hidden-gem.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'hidden-gem-editor'
        },
        body: JSON.stringify({ ref: 'main' })
      }
    );
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('triggerBake failed', r.status, detail, 'reason=' + reason);
    } else {
      console.log('triggerBake ok reason=' + reason);
    }
  } catch (err) {
    console.error('triggerBake error', err, 'reason=' + reason);
  }
}
