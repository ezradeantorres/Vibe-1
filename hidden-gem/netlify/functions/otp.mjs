// POST /.netlify/functions/otp
//   { password: "<password>" }
//     → if the submitted password matches the editor password, mint
//       a 32-hex token, store it in the `site-otp` Netlify Blob keyed
//       by `token:{token}` with a timestamp (the writers re-check the
//       timestamp on each request as a 4-hour TTL), and return
//       { ok: true, token }. Returns { ok: false } on any mismatch.
//
// The editor password is read from the EDITOR_PASSWORD env var when
// set, otherwise falls back to the in-code default. This file used
// to run an email-OTP flow via Resend; that was replaced by a shared
// password because Resend's free tier requires a verified sender
// domain, and the editing surface is small enough that a single
// rotating password is acceptable. The endpoint name stays `otp` so
// the content/image/lock functions keep reading `token:{token}` out
// of the same blob namespace.

import { getStore } from '@netlify/blobs';
import { randomBytes } from 'node:crypto';

const FALLBACK_PASSWORD = 'chloe';
export const TOKEN_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }

  const submitted = String((body && body.password) || '');
  const expected = process.env.EDITOR_PASSWORD || FALLBACK_PASSWORD;

  if (!submitted || !constantTimeEqual(submitted, expected)) {
    return json({ ok: false }, 401);
  }

  const store = getStore('site-otp');
  const token = randomBytes(16).toString('hex'); // 32 hex chars
  await store.setJSON(`token:${token}`, { ts: Date.now() });
  return json({ ok: true, token });
};

function constantTimeEqual(a, b) {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
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
