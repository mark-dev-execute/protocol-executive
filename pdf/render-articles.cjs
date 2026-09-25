// Renders the article guides (src/pages/guide-*.html, as built in public/) to
// assets/guides/<slug>.pdf, using the site's own print styles.
//
//   python3 build.py && NODE_PATH=$(npm root -g) node pdf/render-articles.cjs && python3 build.py
//
// The second build copies the new PDFs into public/. Needs Playwright with Chromium;
// the PDFs are committed, so Vercel never runs this.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'assets', 'guides');
const ORIGIN = 'https://www.fluentintechcoaching.com';
const ARTICLES = ['interview-questions', 'google-interview'];
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };

const FOOTER = `<div style="width:100%;font:8px 'DM Mono',monospace;color:#5b6575;padding:0 14mm;display:flex;justify-content:space-between">
  <span>Fluent in Tech · fluentintechcoaching.com/guides</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  // Serve the built site from public/ without a web server; block everything external.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    let file = path.join(PUBLIC, decodeURIComponent(url.pathname));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ body: fs.readFileSync(file), contentType: TYPES[path.extname(file)] || 'application/octet-stream' });
  });
  for (const slug of ARTICLES) {
    await page.goto(`${ORIGIN}/guides/${slug}/`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
    const out = path.join(OUT, `${slug}.pdf`);
    // scale < 1 lays the page out at desktop width (the site switches to its phone layout below 861px)
    await page.pdf({ path: out, format: 'A4', scale: 0.74, printBackground: true, tagged: true, outline: true,
      displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: FOOTER,
      margin: { top: '14mm', bottom: '16mm', left: '14mm', right: '14mm' } });
    const pages = (fs.readFileSync(out, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    console.log(`${path.relative(ROOT, out)}  ${pages} pages`);
  }
  await browser.close();
}

main().catch((error) => { console.error(error); process.exit(1); });
