// POST /api/subscribe — adds an email address to the guide mailing list.
//
// Called by the signup forms on the guide pages (fetch with JSON, or a plain
// form post when JavaScript is off). Addresses are stored in the Neon Postgres
// database connected to the Vercel project (DATABASE_URL).

import { neon } from '@neondatabase/serverless';

// Stored with every signup as a record of what the person agreed to.
// The form has no checkbox: submitting it is the consent, so the line shown under
// the button is what the person agreed to.
export const CONSENT_TEXT =
  'By subscribing you agree to receive new guides and occasional coaching tips from Fluent in Tech. Unsubscribe any time.';

const SOURCES = {
  '/guides/': 'guides',
  '/guides/interview-questions/': 'guide-interview-questions',
  '/guides/google-interview/': 'guide-google-interview',
};
const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;
const MAX_BODY = 2048;
const MIN_FILL_MS = 800; // faster than a person, even with autofill

let schemaReady = null;

function database() {
  const sql = neon(process.env.DATABASE_URL);
  schemaReady ??= sql`
    CREATE TABLE IF NOT EXISTS subscribers (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      email text NOT NULL UNIQUE,
      source text,
      consent_text text NOT NULL,
      consented_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      unsubscribed_at timestamptz
    )`.catch((error) => { schemaReady = null; throw error; });
  return {
    async save({ email, source }) {
      await schemaReady;
      // A returning subscriber re-consents, so clear any earlier unsubscribe.
      await sql`
        INSERT INTO subscribers (email, source, consent_text)
        VALUES (${email}, ${source}, ${CONSENT_TEXT})
        ON CONFLICT (email) DO UPDATE
          SET consent_text = EXCLUDED.consent_text, consented_at = now(), unsubscribed_at = NULL`;
    },
  };
}

async function readFields(request) {
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

// Plain form posts go back to the page they came from; fetch calls get JSON.
function reply(request, form, status, message) {
  if (form) {
    const back = new URL(request.headers.get('referer') || '/guides/', request.url);
    const target = back.host === new URL(request.url).host ? back : new URL('/guides/', request.url);
    target.search = status < 300 ? '?subscribed=1' : '?subscribed=0';
    target.hash = 'subscribe';
    return Response.redirect(target.href, 303);
  }
  return Response.json({ ok: status < 300, message }, { status });
}

export async function handleSubscribe(request, db) {
  const origin = request.headers.get('origin');
  if (!origin || new URL(origin).host !== new URL(request.url).host) {
    return Response.json({ ok: false, message: 'Forbidden.' }, { status: 403 });
  }

  const parsed = await readFields(request);
  if (!parsed) return Response.json({ ok: false, message: 'Bad request.' }, { status: 400 });
  const { fields, form } = parsed;

  // Bots fill in the hidden field or submit instantly. Pretend it worked.
  const started = Number(fields.t);
  if (fields.company || (started && Date.now() - started < MIN_FILL_MS)) {
    return reply(request, form, 200, 'You’re in — new guides will arrive in your inbox.');
  }

  const email = String(fields.email || '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) {
    return reply(request, form, 400, 'Please enter a valid email address.');
  }
  // The page sets the source; without JavaScript, fall back to the page it came from.
  const known = Object.values(SOURCES);
  const referer = request.headers.get('referer');
  const source = known.includes(fields.source) ? fields.source
    : (referer && SOURCES[new URL(referer, request.url).pathname]) || 'unknown';

  try {
    await db.save({ email, source });
  } catch (error) {
    console.error('subscribe: could not save signup', error?.message);
    return reply(request, form, 500, 'Something went wrong. Please try again, or email mark.parfenov@gmail.com.');
  }
  return reply(request, form, 200, 'You’re in — new guides will arrive in your inbox.');
}

export async function POST(request) {
  return handleSubscribe(request, database());
}
