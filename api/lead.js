// POST /api/lead — records a request for Mark to get in touch. Two forms use it:
//   - the form shown before a program guide downloads: name, email and the guide
//     (visitors can also skip it with "No thanks" and download without sending anything)
//   - the message form on the booking page: name and email
// Requests are stored in the "leads" table of the Neon Postgres database, and Mark is
// emailed about each one (see notifyMark in _shared.js).

import { neon } from '@neondatabase/serverless';
import { waitUntil } from '@vercel/functions';
import { cleanEmail, json, looksLikeBot, notifyMark, readFields, sameOrigin } from './_shared.js';

// Program guide slugs, as used in assets/programs/<slug>.pdf and build.py.
const GUIDES = new Set([
  'communication-program', 'executive-communication-program', 'career-accelerator',
  'executive-interview-program', 'career-coaching-program', 'leadership-program',
  'leadership-circle', 'executive-edge', 'corporate-programs',
]);
// Services a booking link can preselect (book/?service=…).
const TOPICS = new Set(['interview', 'communication', 'leadership', 'corporate', 'cohort', 'business']);
const THANKS = 'Thanks. I’ll email you to arrange your free consultation.';
const THANKS_MESSAGE = 'Thanks. I’ll email you within 24 hours.';

let schemaReady = null;

function database() {
  const sql = neon(process.env.DATABASE_URL);
  schemaReady ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS leads (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        email text NOT NULL,
        guide text,
        page text,
        created_at timestamptz NOT NULL DEFAULT now(),
        contacted_at timestamptz
      )`;
    await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS name text`;
    await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS topic text`;
  })().catch((error) => { schemaReady = null; throw error; });
  return {
    async save({ email, name, guide, topic, page }) {
      await schemaReady;
      await sql`INSERT INTO leads (email, name, guide, topic, page)
                VALUES (${email}, ${name}, ${guide}, ${topic}, ${page})`;
    },
  };
}

// A plain-text name: no control characters, collapsed spaces, at most 100 characters.
const cleanName = (value) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ').trim().slice(0, 100) || null;

// Without JavaScript the booking form posts normally: send the visitor back to the form.
function reply(request, form, status, message) {
  if (form) {
    const back = new URL(request.headers.get('referer') || '/book/', request.url);
    const target = back.host === new URL(request.url).host ? back : new URL('/book/', request.url);
    target.search = status < 300 ? '?sent=1' : '?sent=0';
    target.hash = 'message';
    return Response.redirect(target.href, 303);
  }
  return json(status, message);
}

export async function handleLead(request, db, notify = notifyMark) {
  if (!sameOrigin(request)) return json(403, 'Forbidden.');
  const parsed = await readFields(request);
  if (!parsed) return json(400, 'Bad request.');
  const { fields, form } = parsed;
  const guide = GUIDES.has(fields.guide) ? fields.guide : null;
  const isMessage = !guide; // no guide: the booking-page message form
  const thanks = isMessage ? THANKS_MESSAGE : THANKS;

  if (looksLikeBot(fields)) return reply(request, form, 200, thanks);

  const email = cleanEmail(fields.email);
  if (!email) return reply(request, form, 400, 'Please enter a valid email address.');
  const name = cleanName(fields.name);
  if ('name' in fields && !name) return reply(request, form, 400, 'Please enter your name.');
  const topic = TOPICS.has(fields.topic) ? fields.topic : null;
  const referer = request.headers.get('referer');
  const page = referer ? new URL(referer, request.url).pathname.slice(0, 200) : null;

  try {
    await db.save({ email, name, guide, topic, page });
  } catch (error) {
    console.error('lead: could not save request', error?.message);
    return reply(request, form, 500, 'Something went wrong. Please email me at mark.parfenov@gmail.com instead.');
  }
  const pageUrl = page ? `https://www.fluentintechcoaching.com${page}` : 'unknown';
  const who = name ? `${name} <${email}>` : email;
  await notify(isMessage ? `New message request: ${who}` : `New consultation request: ${who}`, [
    isMessage ? 'Someone left their name and email on the booking page.'
      : 'Someone downloaded a program guide and left their name and email for a free consultation.',
    '',
    ...(name ? [`Name: ${name}`] : []),
    `Email: ${email}`,
    ...(guide ? [`Guide: ${guide}`] : []),
    ...(topic ? [`Interested in: ${topic}`] : []),
    `Page: ${pageUrl}`,
    '',
    'Reply to this email to answer them directly. The request is also saved in the leads table in Neon.',
  ], email);
  return reply(request, form, 200, thanks);
}

export async function POST(request) {
  // Send the email after responding, so the visitor never waits for Gmail.
  return handleLead(request, database(), (...args) => waitUntil(notifyMark(...args)));
}
