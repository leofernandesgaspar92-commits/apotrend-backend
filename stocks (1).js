// /api/stocks — Pharma-Aktienkurse via Yahoo Finance (kein API-Key nötig)
const SYMBOLS = [
  { sym: 'PFE',     name: 'Pfizer',       flag: '🇺🇸' },
  { sym: 'NVS',     name: 'Novartis',     flag: '🇨🇭' },
  { sym: 'BAYRY',   name: 'Bayer',        flag: '🇩🇪' },
  { sym: 'RHHBY',   name: 'Roche',        flag: '🇨🇭' },
  { sym: 'AZN',     name: 'AstraZeneca',  flag: '🇬🇧' },
  { sym: 'SNY',     name: 'Sanofi',       flag: '🇫🇷' },
  { sym: 'MRK',     name: 'Merck',        flag: '🇺🇸' },
  { sym: 'JNJ',     name: 'Johnson & Johnson', flag: '🇺🇸' },
];

async function fetchQuote(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
    }
  });
  if (!r.ok) throw new Error(sym + ' HTTP ' + r.status);
  const d = await r.json();
  const meta = d.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(sym + ': no meta');
  const closes = d.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
  const prev   = closes.length >= 2 ? closes[closes.length - 2] : meta.chartPreviousClose;
  const curr   = meta.regularMarketPrice || meta.previousClose;
  const change = prev ? ((curr - prev) / prev) * 100 : 0;
  return {
    sym,
    price:    parseFloat(curr.toFixed(2)),
    change:   parseFloat(change.toFixed(2)),
    currency: meta.currency || 'USD',
    market:   meta.exchangeName || '',
    ts:       meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  const results = await Promise.allSettled(SYMBOLS.map(s => fetchQuote(s.sym)));
  const stocks = SYMBOLS.map((s, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') return { ...s, ...r.value };
    return { ...s, price: null, change: null, error: r.reason?.message };
  });
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  res.json({ ok: true, ts: new Date().toISOString(), stocks });
}
