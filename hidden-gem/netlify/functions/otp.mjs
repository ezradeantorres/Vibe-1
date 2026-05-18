// POST /.netlify/functions/otp
//   { action: "request", email }
//     → if email in whitelist, generate 6-digit code,
//       store in 'site-otp' blob keyed by email with timestamp,
//       email it via Resend.
//   { action: "verify", email, code }
//     → if code matches and is < 10 min old, mint a 32-hex token,
//       store in 'site-otp' blob keyed by `token:${token}` with timestamp,
//       return { ok: true, token }.
//
// The blob stores act as the TTL store: each entry carries a `ts` and we
// reject anything older than the configured window on read. Stale entries
// are best-effort overwritten on the next write; we don't run a sweeper.

import { getStore } from '@netlify/blobs';
import { randomInt, randomBytes } from 'node:crypto';

// Hard-coded whitelist. Add or remove entries here and redeploy.
const WHITELIST = new Set([
  'etorres@care.life',
  'elena@hiddengemhealingutah.com'
]);

const CODE_TTL_MS = 10 * 60 * 1000;       // 10 minutes
export const TOKEN_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

const PRIMARY_FROM = 'Hidden Gem <noreply@hiddengemhealingutah.com>';
const FALLBACK_FROM = 'Hidden Gem <onboarding@resend.dev>';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
  const { action } = body || {};
  if (!action) return json({ error: 'missing action' }, 400);

  const store = getStore('site-otp');

  if (action === 'request') {
    const email = normalizeEmail(body.email);
    if (!email) return json({ error: 'missing email' }, 400);
    // Always respond ok so we don't reveal which addresses are whitelisted.
    if (!WHITELIST.has(email)) return json({ ok: true });

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const ts = Date.now();
    await store.setJSON(`email:${email}`, { code, ts });

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return json({ error: 'email service not configured' }, 500);
    }

    const sendResult = await sendOtpEmail({ apiKey: resendKey, to: email, code });
    if (!sendResult.ok) {
      return json({ error: 'failed to send email', detail: sendResult.detail }, 502);
    }
    return json({ ok: true });
  }

  if (action === 'verify') {
    const email = normalizeEmail(body.email);
    const code = String(body.code || '').trim();
    if (!email || !code) return json({ error: 'missing email or code' }, 400);
    if (!WHITELIST.has(email)) return json({ ok: false }, 401);

    const stored = await store.get(`email:${email}`, {
      type: 'json',
      consistency: 'strong'
    });
    if (!stored || !stored.code || !stored.ts) return json({ ok: false }, 401);
    if (Date.now() - stored.ts > CODE_TTL_MS) return json({ ok: false, expired: true }, 401);
    if (!constantTimeEqual(String(stored.code), code)) return json({ ok: false }, 401);

    // Single-use: clear the code so it can't be re-used.
    await store.delete(`email:${email}`);

    const token = randomBytes(16).toString('hex'); // 32 hex chars
    await store.setJSON(`token:${token}`, { email, ts: Date.now() });
    return json({ ok: true, token });
  }

  return json({ error: 'unknown action' }, 400);
};

function normalizeEmail(e) {
  if (typeof e !== 'string') return '';
  return e.trim().toLowerCase();
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sendOtpEmail({ apiKey, to, code }) {
  const subject = 'Your Hidden Gem editor sign-in code';
  const text = `Your sign-in code is ${code}\n\nIt expires in 10 minutes.\n\nIf you did not request this, you can ignore this email.`;
  const html = `<p>Your sign-in code is:</p><p style="font-size:28px;letter-spacing:6px;font-weight:600;font-family:monospace">${code}</p><p>It expires in 10 minutes.</p><p style="color:#666;font-size:12px">If you did not request this, you can ignore this email.</p>`;

  // Try the verified domain first, fall back to onboarding@resend.dev if
  // Resend rejects the from-address (typically a 403 "domain not verified").
  const primary = await postResend({ apiKey, from: PRIMARY_FROM, to, subject, text, html });
  if (primary.ok) return { ok: true };
  if (primary.status === 403 || primary.status === 422 || primary.status === 400) {
    const fb = await postResend({ apiKey, from: FALLBACK_FROM, to, subject, text, html });
    if (fb.ok) return { ok: true };
    return { ok: false, detail: fb.detail || primary.detail };
  }
  return { ok: false, detail: primary.detail };
}

async function postResend({ apiKey, from, to, subject, text, html }) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ from, to, subject, text, html })
    });
    if (res.ok) return { ok: true };
    const detail = await res.text().catch(() => '');
    return { ok: false, status: res.status, detail };
  } catch (err) {
    return { ok: false, status: 0, detail: String(err && err.message || err) };
  }
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
