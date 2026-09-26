// Renders the program guides in pdf/guides/*.html to assets/programs/*.pdf.
//
//   NODE_PATH=$(npm root -g) node pdf/render.cjs          # all guides
//   NODE_PATH=$(npm root -g) node pdf/render.cjs fluency  # one guide
//
// Each guide is an HTML fragment. It is wrapped with pdf/guide.css, and the
// marker <!-- closing --> is replaced with the booking block below. Prices are printed in euros.
// Needs Playwright with Chromium; the PDFs are committed, so Vercel never runs this.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const GUIDES = path.join(__dirname, 'guides');
const BUILD = path.join(__dirname, '.build');
const OUT = path.join(ROOT, 'assets', 'programs');

const SITE = 'https://www.fluentintechcoaching.com';
// The booking page preselects the service each guide is about (book/?service=…).
const SERVICE = {
  'communication-program': 'communication', 'executive-communication-program': 'communication',
  'career-accelerator': 'interview', 'executive-interview-program': 'interview', 'career-coaching-program': 'interview',
  'leadership-program': 'leadership', 'executive-edge': 'leadership', 'leadership-circle': 'cohort',
  'corporate-programs': 'corporate',
};
const bookUrl = (slug) => `${SITE}/book/?service=${SERVICE[slug] || ''}`.replace(/\?service=$/, '');

// Prices in the guides are written in US dollars and printed in euros, with the same
// fallback rate and rounding as the website (FX_FALLBACK and to_euros in build.py).
const FX = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'build.py'), 'utf8');
  const m = src.match(/FX_FALLBACK = \{"rate": ([\d.]+), "date": "([\d-]+)"\}/);
  if (!m) throw new Error('FX_FALLBACK not found in build.py');
  return { rate: Number(m[1]), date: m[2] };
})();
const toEuros = (usd) => { const eur = usd * FX.rate; return eur < 200 ? Math.round(eur) : Math.round(eur / 5) * 5; };
const num = (s) => Number(s.replace(/,/g, ''));
const fmt = (n) => n.toLocaleString('en-US');
const euros = (html) => html.replace(/\$(\d[\d,]*)(?:(\s*[–-]\s*)\$?(\d[\d,]*))?/g,
  (_, low, dash, high) => high ? `€${fmt(toEuros(num(low)))}${dash}${fmt(toEuros(num(high)))}` : `€${fmt(toEuros(num(low)))}`);
const fxDate = new Date(`${FX.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const coverCta = (slug) => `<a class="cover-cta" href="${bookUrl(slug)}">Book a free consultation →</a>`;
const closing = (slug) => `
<div class="end">
<section class="closing">
  <span class="eyebrow">Next step</span>
  <h2>Book a free consultation</h2>
  <p>Tell me where you are now, where you want to be and what’s in the way. You’ll leave the call with a clear recommendation from me, whether or not we decide to work together.</p>
  <a class="cta-button" href="${bookUrl(slug)}">Book a free call →</a>
  <div class="contact">
    <div><span>Book</span><a href="${bookUrl(slug)}">fluentintechcoaching.com/book</a></div>
    <div><span>Email</span><a href="mailto:mark.parfenov@gmail.com">mark.parfenov@gmail.com</a></div>
    <div><span>Prices</span><a href="${SITE}/pricing/">fluentintechcoaching.com/pricing</a></div>
  </div>
</section>
<p class="fine" style="margin-top:10pt">Prices in euros, rounded, converted from US dollars at the European Central Bank rate of ${fxDate} and correct at the time of publishing; the website shows current prices, and your invoice shows the exact amount. Every result depends on your market and the work you put in; no outcome is guaranteed. © Fluent in Tech · Mark Parfenov. All rights reserved.</p>
</div>`;

async function main() {
  const only = process.argv[2];
  const files = fs.readdirSync(GUIDES).filter((f) => f.endsWith('.html') && (!only || f === `${only}.html`));
  if (!files.length) throw new Error(`No guide found${only ? ` named ${only}` : ''}.`);
  fs.mkdirSync(BUILD, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const file of files) {
    const slug = file.replace(/\.html$/, '');
    const body = euros(fs.readFileSync(path.join(GUIDES, file), 'utf8'))
      .replace(/(<p class="url">)/, `${coverCta(slug)}\n  $1`);
    if (!body.includes('<!-- closing -->') || !body.includes('cover-cta')) throw new Error(`${file}: missing cover or closing marker`);
    const title = (body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [, 'Program guide'])[1].replace(/<[^>]+>/g, '');
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title} | Fluent in Tech</title>
<link rel="stylesheet" href="../guide.css"></head><body>${body.replace('<!-- closing -->', closing(slug))}</body></html>`;
    const tmp = path.join(BUILD, file);
    fs.writeFileSync(tmp, html);
    await page.goto('file://' + tmp, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const out = path.join(OUT, file.replace(/\.html$/, '.pdf'));
    await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });
    const pages = (fs.readFileSync(out, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    console.log(`${path.relative(ROOT, out)}  ${pages} pages  ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
  }
  await browser.close();
}

main().catch((error) => { console.error(error); process.exit(1); });
