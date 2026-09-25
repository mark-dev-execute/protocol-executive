// POST /api/lead — records a free-consultation request made after downloading a
// program guide. Leaving an email is optional: the download never depends on it.
// Requests are stored in the "leads" table of the Neon Postgres database.

import { neon } from '@neondatabase/serverless';
import { waitUntil } from '@vercel/functions';
import { cleanEmail, json, looksLikeBot, notifyMark, readFields, sameOrigin } from './_shared.js';

// Program guide slugs, as used in assets/programs/<slug>.pdf and build.py.
const GUIDES = new Set([
  'communication-program', 'executive-communication-program', 'career-accelerator',
  'executive-interview-program', 'career-coaching-program', 'leadership-program',
  'leadership-circle', 'executive-edge', 'corporate-programs',
]);
const THANKS = 'Thanks — Mark will email you to arrange your free consultation.';

let schemaReady = null;

function database() {
  const sql = neon(process.env.DATABASE_URL);
  schemaReady ??= sql`
    CREATE TABLE IF NOT EXISTS leads (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      email text NOT NULL,
      guide text,
      page text,
      created_at timestamptz NOT NULL DEFAULT now(),
      contacted_at timestamptz
    )`.catch((error) => { schemaReady = null; throw error; });
  return {
    async save({ email, guide, page }) {
      await schemaReady;
      await sql`INSERT INTO leads (email, guide, page) VALUES (${email}, ${guide}, ${page})`;
    },
  };
}

export async function handleLead(request, db, notify = notifyMark) {
  if (!sameOrigin(request)) return json(403, 'Forbidden.');
  const parsed = await readFields(request);
  if (!parsed) return json(400, 'Bad request.');
  const { fields } = parsed;

  if (looksLikeBot(fields)) return json(200, THANKS);

  const email = cleanEmail(fields.email);
  if (!email) return json(400, 'Please enter a valid email address.');
  const guide = GUIDES.has(fields.guide) ? fields.guide : null;
  const referer = request.headers.get('referer');
  const page = referer ? new URL(referer, request.url).pathname.slice(0, 200) : null;

  try {
    await db.save({ email, guide, page });
  } catch (error) {
    console.error('lead: could not save request', error?.message);
    return json(500, 'Something went wrong. Please email mark.parfenov@gmail.com instead.');
  }
  await notify(`New consultation request: ${email}`, [
    'Someone asked for a free consultation after downloading a program guide.',
    '',
    `Email: ${email}`,
    `Guide: ${guide || 'unknown'}`,
    `Page: ${page ? `https://www.fluentintechcoaching.com${page}` : 'unknown'}`,
    '',
    'Reply to this email to answer them directly. The request is also saved in the leads table in Neon.',
  ], email);
  return json(200, THANKS);
}

export async function POST(request) {
  // Send the email after responding, so the visitor never waits for Gmail.
  return handleLead(request, database(), (...args) => waitUntil(notifyMark(...args)));
}
