// POST /api/subscribe — adds an email address to the guide mailing list.
//
// Called by the signup forms on the guide pages (fetch with JSON, or a plain
// form post when JavaScript is off). Addresses are stored in the Neon Postgres
// database connected to the Vercel project (DATABASE_URL).

import { neon } from '@neondatabase/serverless';
import { cleanEmail, json, looksLikeBot, readFields, sameOrigin } from './_shared.js';

// Stored with every signup as a record of what the person agreed to.
// The form has no checkbox: submitting it is the consent, so the line shown under
// the button is what the person agreed to.
export const CONSENT_TEXT =
  'By subscribing you agree to receive new guides and occasional coaching tips from Fluent in Tech. Unsubscribe any time.';

// Signups from the form shown before an article guide PDF downloads (name and email),
// with the wording shown in that form (build.py DIALOG_TEXT) as the consent record.
const DOWNLOAD_SOURCES = ['download-interview-questions', 'download-google-interview'];
export const DOWNLOAD_CONSENT_TEXT =
  'By sharing your email you agree to receive new guides and occasional coaching tips from Fluent in Tech. Unsubscribe any time.';
const SOURCES = {
  '/guides/': 'guides',
  '/guides/interview-questions/': 'guide-interview-questions',
  '/guides/google-interview/': 'guide-google-interview',
};

let schemaReady = null;

function database() {
  const sql = neon(process.env.DATABASE_URL);
  schemaReady ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS subscribers (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        email text NOT NULL UNIQUE,
        source text,
        consent_text text NOT NULL,
        consented_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        unsubscribed_at timestamptz
      )`;
    await sql`ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS name text`;
  })().catch((error) => { schemaReady = null; throw error; });
  return {
    async save({ email, source, name = null, consent = CONSENT_TEXT }) {
      await schemaReady;
      // A returning subscriber re-consents, so clear any earlier unsubscribe.
      await sql`
        INSERT INTO subscribers (email, source, consent_text, name)
        VALUES (${email}, ${source}, ${consent}, ${name})
        ON CONFLICT (email) DO UPDATE
          SET consent_text = EXCLUDED.consent_text, consented_at = now(), unsubscribed_at = NULL,
              name = COALESCE(EXCLUDED.name, subscribers.name)`;
    },
  };
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
  return json(status, message);
}

export async function handleSubscribe(request, db) {
  if (!sameOrigin(request)) return json(403, 'Forbidden.');
  const parsed = await readFields(request);
  if (!parsed) return json(400, 'Bad request.');
  const { fields, form } = parsed;

  // Pretend bot submissions worked, so they don't retry.
  if (looksLikeBot(fields)) return reply(request, form, 200, 'You’re in. New guides will arrive in your inbox.');

  const email = cleanEmail(fields.email);
  if (!email) return reply(request, form, 400, 'Please enter a valid email address.');
  // The page sets the source; without JavaScript, fall back to the page it came from.
  const known = [...Object.values(SOURCES), ...DOWNLOAD_SOURCES];
  const referer = request.headers.get('referer');
  const source = known.includes(fields.source) ? fields.source
    : (referer && SOURCES[new URL(referer, request.url).pathname]) || 'unknown';

  try {
    const fromDownload = DOWNLOAD_SOURCES.includes(source);
    const name = String(fields.name || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || null;
    if (fromDownload && !name) return reply(request, form, 400, 'Please enter your name.');
    await db.save({ email, source, name, consent: fromDownload ? DOWNLOAD_CONSENT_TEXT : CONSENT_TEXT });
  } catch (error) {
    console.error('subscribe: could not save signup', error?.message);
    return reply(request, form, 500, 'Something went wrong. Please try again, or email me at mark.parfenov@gmail.com.');
  }
  return reply(request, form, 200, 'You’re in. New guides will arrive in your inbox.');
}

export async function POST(request) {
  return handleSubscribe(request, database());
}
