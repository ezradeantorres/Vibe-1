// Auto-invoked by Netlify when ANY form submission lands. For the
// `appointment` form we email a formatted summary via Resend to the
// configured recipient(s). Netlify Forms still stores the raw
// submission in the dashboard as the source of truth — this function
// is the email notification layer on top.
//
// Required env vars:
//   RESEND_API_KEY        — same key used by otp.mjs
//   APPOINTMENT_RECIPIENT — comma-separated email list. Defaults to
//                           'etorres@care.life' for testing. Switch to
//                           elena@hiddengemhealingutah.com (or both)
//                           once submissions are confirmed flowing.
//
// Returns 200 even on internal failure so Netlify doesn't retry and
// double-send. Failures are logged; check Netlify Function logs if a
// submission didn't generate an email.

const PRIMARY_FROM = 'Hidden Gem <noreply@hiddengemhealingutah.com>';
const FALLBACK_FROM = 'Hidden Gem <onboarding@resend.dev>';
const DEFAULT_RECIPIENT = 'etorres@care.life';
const RESEND_TIMEOUT_MS = 4000; // worst-case 8s total with one fallback retry

export default async (req) => {
  let body;
  try { body = await req.json(); } catch { return text('invalid json', 400); }
  const payload = body && body.payload;
  if (!payload || payload.name !== 'appointment') {
    return text('ok'); // ignore non-appointment forms
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('submission-created: RESEND_API_KEY not set; skipping email');
    return text('ok'); // Netlify dashboard still has the record
  }

  const recipients = (process.env.APPOINTMENT_RECIPIENT || DEFAULT_RECIPIENT)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (recipients.length === 0) {
    console.error('submission-created: no recipients configured');
    return text('ok');
  }

  const result = await sendAppointmentEmail({
    apiKey,
    to: recipients,
    data: payload.data || {},
    submittedAt: payload.created_at || new Date().toISOString()
  });
  if (!result.ok) {
    console.error('submission-created: send failed', result.detail || result.status);
  }
  return text('ok');
};

async function sendAppointmentEmail({ apiKey, to, data, submittedAt }) {
  const firstName = String(data.first_name || '').trim();
  const lastName = String(data.last_name || '').trim();
  const requesterName = `${firstName} ${lastName}`.trim() || 'Someone';
  const requesterEmail = String(data.email || '').trim();

  const subject = `New appointment request from ${requesterName}`;
  const rows = [
    ['Name', requesterName],
    ['Phone', data.phone],
    ['Email', requesterEmail],
    ['Provider requested', data.provider],
    ['Preferred contact', data.preferred_contact],
    ['Preferred time', data.preferred_time],
    ['Message', data.message],
    ['Submitted at', submittedAt]
  ].filter(([, v]) => v != null && String(v).trim() !== '');

  const textBody = rows.map(([k, v]) => `${k}: ${v}`).join('\n');
  const htmlRows = rows.map(([k, v]) =>
    `<tr>` +
      `<td style="padding:6px 12px 6px 0;color:#555;vertical-align:top">${escapeHtml(k)}</td>` +
      `<td style="padding:6px 0;color:#222;vertical-align:top;white-space:pre-wrap">${escapeHtml(String(v))}</td>` +
    `</tr>`
  ).join('');
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif">` +
      `<h2 style="color:#1e3a2f;margin-bottom:16px">New appointment request</h2>` +
      `<table style="border-collapse:collapse;font-size:14px">${htmlRows}</table>` +
    `</div>`;

  const replyTo = requesterEmail || undefined;
  const primary = await postResend({ apiKey, from: PRIMARY_FROM, to, subject, text: textBody, html, replyTo });
  if (primary.ok) return { ok: true };
  if (primary.status === 0 || primary.status === 400 || primary.status === 403 || primary.status === 422) {
    const fb = await postResend({ apiKey, from: FALLBACK_FROM, to, subject, text: textBody, html, replyTo });
    if (fb.ok) return { ok: true };
    return { ok: false, status: fb.status, detail: fb.detail || primary.detail };
  }
  return primary;
}

async function postResend({ apiKey, from, to, subject, text, html, replyTo }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
  const payload = { from, to, subject, text, html };
  if (replyTo) payload.reply_to = replyTo;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (res.ok) return { ok: true };
    const detail = await res.text().catch(() => '');
    return { ok: false, status: res.status, detail };
  } catch (err) {
    const isAbort = err && err.name === 'AbortError';
    return { ok: false, status: 0, detail: isAbort ? 'timeout' : String(err && err.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function text(msg, status = 200) {
  return new Response(msg, {
    status,
    headers: { 'content-type': 'text/plain' }
  });
}
