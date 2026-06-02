// /api/news — aggregates real pharma news.
// Primary: public RSS feeds (Drugs.com). Always-on fallback: openFDA drug enforcement JSON.

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const FEEDS = [
  { url: 'https://www.drugs.com/feeds/medical_news.xml',       source: 'Drugs.com', cat: 'pharma' },
  { url: 'https://www.drugs.com/feeds/fda_alerts.xml',         source: 'FDA-Alert', cat: 'rueckruf' },
  { url: 'https://www.drugs.com/feeds/new_drug_approvals.xml', source: 'Neuzulassung', cat: 'pharma' },
];

function parseRSS(xml) {
  const items = [];
  const rx = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = rx.exec(xml)) !== null) {
    const block = m[1];
    const title = (block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
                   block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const desc  = (block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
                   block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || '';
    const link  = (block.match(/<link><!\[CDATA\[([\s\S]*?)\]\]><\/link>/) ||
                   block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
    const date = pubDate ? new Date(pubDate).toLocaleDateString('de-AT') : new Date().toLocaleDateString('de-AT');
    const cleanDesc = desc.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#\d+;/g,' ').trim().slice(0, 200);
    const cleanTitle = title.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&#\d+;/g,' ').trim().slice(0, 120);
    if (cleanTitle.length > 5) items.push({ title: cleanTitle, desc: cleanDesc, link: link.trim(), date });
  }
  return items;
}

async function fetchFeed(feed) {
  const r = await fetch(feed.url, {
    headers: { 'User-Agent': BROWSER_UA, 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(feed.source + ' HTTP ' + r.status);
  const xml = await r.text();
  const parsed = parseRSS(xml).slice(0, 8).map(i => ({ ...i, source: feed.source, cat: feed.cat }));
  if (parsed.length === 0) throw new Error(feed.source + ' parse: 0 items');
  return parsed;
}

// Always-on fallback: real recall data from openFDA (same source that powers /api/recalls)
async function fetchOpenFDA() {
  const url = 'https://api.fda.gov/drug/enforcement.json?search=report_date:[20250101+TO+20261231]&sort=report_date:desc&limit=12';
  const r = await fetch(url, { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('openFDA HTTP ' + r.status);
  const data = await r.json();
  if (!data.results) throw new Error('openFDA no results');
  return data.results.map(x => {
    const rd = x.report_date || '';
    const date = rd.length === 8 ? `${rd.slice(6,8)}.${rd.slice(4,6)}.${rd.slice(0,4)}` : new Date().toLocaleDateString('de-AT');
    return {
      title: (x.product_description || 'Rückruf').slice(0, 120),
      desc: (x.reason_for_recall || '').slice(0, 200),
      link: '',
      date,
      source: 'openFDA',
      cat: 'rueckruf',
    };
  });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const results = await Promise.allSettled(FEEDS.map(f => fetchFeed(f)));
  let items = [];
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') items = items.concat(r.value);
    else errors.push(FEEDS[i].source + ': ' + r.reason.message);
  });

  // If RSS feeds yielded nothing, use the guaranteed openFDA fallback.
  let source = 'rss';
  if (items.length === 0) {
    try { items = await fetchOpenFDA(); source = 'openFDA-fallback'; }
    catch (e) { errors.push('openFDA: ' + e.message); }
  }

  items.sort((a, b) => {
    const pa = a.date.split('.').reverse().join('-');
    const pb = b.date.split('.').reverse().join('-');
    return pb.localeCompare(pa);
  });

  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
  res.json({ ok: true, source, count: items.length, ts: new Date().toISOString(), errors: errors.length ? errors : undefined, items });
}
