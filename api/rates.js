// GET /api/rates — the latest USD→EUR reference rate, for the currency switch in
// app.js. Served from our own origin so the page's Content Security Policy stays
// 'self'-only, and cached by Vercel's CDN so the sources are asked at most hourly.
// Source: the European Central Bank's daily reference rates, with Frankfurter
// (which republishes the same ECB data) as a fallback.

const ECB = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const FRANKFURTER = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR';
const TIMEOUT_MS = 4000;
const CACHE = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400';

// A USD→EUR rate outside this range is a parsing error, not a market move.
const plausible = (rate) => Number.isFinite(rate) && rate > 0.5 && rate < 1.5;

// The ECB publishes EUR→USD (e.g. 1.0850 dollars per euro); we need the inverse.
async function fromEcb(fetcher) {
  const response = await fetcher(ECB, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`ECB ${response.status}`);
  const xml = await response.text();
  const usd = Number(xml.match(/currency=['"]USD['"]\s+rate=['"]([\d.]+)['"]/)?.[1]);
  const date = xml.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
  if (!usd || !date) throw new Error('ECB: unexpected format');
  return { rate: Number((1 / usd).toFixed(6)), date, source: 'European Central Bank' };
}

async function fromFrankfurter(fetcher) {
  const response = await fetcher(FRANKFURTER, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Frankfurter ${response.status}`);
  const data = await response.json();
  const rate = Number(data?.rates?.EUR);
  if (!rate || !/^\d{4}-\d{2}-\d{2}$/.test(data?.date || '')) throw new Error('Frankfurter: unexpected format');
  return { rate, date: data.date, source: 'European Central Bank' };
}

export async function handleRates(fetcher = fetch) {
  for (const source of [fromEcb, fromFrankfurter]) {
    try {
      const result = await source(fetcher);
      if (plausible(result.rate)) {
        return Response.json({ base: 'USD', currency: 'EUR', ...result }, { headers: { 'Cache-Control': CACHE } });
      }
      console.error('rates: implausible rate', result.rate);
    } catch (error) {
      console.error('rates:', error?.message);
    }
  }
  return Response.json({ error: 'Exchange rate unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}

export function GET() {
  return handleRates();
}
