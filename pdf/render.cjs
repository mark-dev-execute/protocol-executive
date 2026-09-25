// Renders the program guides in pdf/guides/*.html to assets/programs/*.pdf.
//
//   NODE_PATH=$(npm root -g) node pdf/render.cjs          # all guides
//   NODE_PATH=$(npm root -g) node pdf/render.cjs fluency  # one guide
//
// Each guide is an HTML fragment. It is wrapped with pdf/guide.css, and the
// marker <!-- closing --> is replaced with the standard contact block below.
// Needs Playwright with Chromium; the PDFs are committed, so Vercel never runs this.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const GUIDES = path.join(__dirname, 'guides');
const BUILD = path.join(__dirname, '.build');
const OUT = path.join(ROOT, 'assets', 'programs');

const CLOSING = `
<div class="end">
<section class="closing">
  <span class="eyebrow">Next step</span>
  <h2>Start with a free call.</h2>
  <p>Tell Mark where you are now, where you want to be and what’s in the way. You’ll leave the call with a clear recommendation — whether or not you decide to work together.</p>
  <div class="contact">
    <div><span>Book</span><a href="https://www.fluentintechcoaching.com/book/">fluentintechcoaching.com/book</a></div>
    <div><span>Email</span><a href="mailto:mark.parfenov@gmail.com">mark.parfenov@gmail.com</a></div>
    <div><span>Pricing</span><a href="https://www.fluentintechcoaching.com/pricing/">fluentintechcoaching.com/pricing</a></div>
  </div>
</section>
<p class="fine" style="margin-top:10pt">Prices in USD, correct at the time of publishing — the website shows current prices. Every result depends on your market and the work you put in; no outcome is guaranteed. © Fluent in Tech · Mark Parfenov. All rights reserved.</p>
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
    const body = fs.readFileSync(path.join(GUIDES, file), 'utf8');
    const title = (body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [, 'Program guide'])[1].replace(/<[^>]+>/g, '');
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title} | Fluent in Tech</title>
<link rel="stylesheet" href="../guide.css"></head><body>${body.replace('<!-- closing -->', CLOSING)}</body></html>`;
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
