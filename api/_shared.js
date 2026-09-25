// Helpers shared by the form endpoints in api/. Files starting with "_" are not
// deployed as functions of their own.

const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;
const MAX_BODY = 2048;
const MIN_FILL_MS = 800; // faster than a person, even with autofill

// Only accept posts from our own pages.
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return Boolean(origin) && new URL(origin).host === new URL(request.url).host;
}

// Parses a JSON or URL-encoded body. Returns null for anything else or oversized bodies.
export async function readFields(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    try { return { fields: JSON.parse(text), form: false }; } catch { return null; }
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    return { fields: Object.fromEntries(new URLSearchParams(text)), form: true };
  }
  return null;
}

// Bots fill in the hidden "company" field or submit instantly.
export function looksLikeBot(fields) {
  const started = Number(fields.t);
  return Boolean(fields.company) || Boolean(started && Date.now() - started < MIN_FILL_MS);
}

// Returns the normalized address, or null if it isn't a plausible email.
export function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

export const json = (status, message) => Response.json({ ok: status < 300, message }, { status });
