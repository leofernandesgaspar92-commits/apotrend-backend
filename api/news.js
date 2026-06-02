// /api/news — aggregates pharma news from public RSS feeds
// Sources: EMA news, BASG press releases, FDA drug safety

const FEEDS = [
  {
    url: 'https://www.ema.europa.eu/en/news-events/news/rss-news',
    source: 'EMA',
    cat: 'pharma',
  },
  {
    url: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch-safety-alerts/rss.xml',
    source: 'FDA',
    cat: 'rueckruf',
  },
];

function parseRSS(xml) {
  const items = [];
  const rx = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = rx.exec(xml)) !== null) {
    const block = m[1];
    const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                   block.match(/<title>(.*?)<\/title>/) || [])[1] || '';
    const desc  = (block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                   block.match(/<description>(.*?)<\/description>/) || [])[1] || '';
    const link  = (block.match(/<link>(.*?)<\/link>/) || [])[1] || '';
    const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
    const date = pubDate ? new Date(pubDate).toLocaleDateString('de-AT') : new Date().toLocaleDateString('de-AT');
    const cleanDesc = desc.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim().slice(0, 200);
    const cleanTitle = title.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').trim().slice(0, 120);
    if (cleanTitle.length > 5) {
      items.push({ title: cleanTitle, desc: cleanDesc, link, date });
    }
  }
  return items;
}

async function fetchFeed(feed) {
  const r = await fetch(feed.url, {
    headers: { 'User-Agent': 'ApoTrend/2.0 Research Bot', 'Accept': 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(7000),
  });
  if (!r.ok) throw new Error(feed.source + ' HTTP ' + r.status);
  const xml = await r.text();
  return parseRSS(xml).slice(0, 8).map(i => ({ ...i, source: feed.source, cat: feed.cat }));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const results = await Promise.allSettled(FEEDS.map(f => fetchFeed(f)));
  let items = [];
  const errors = [];

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      items = items.concat(r.value);
    } else {
      errors.push(FEEDS[i].source + ': ' + r.reason.message);
    }
  });

  // Sort by date descending
  items.sort((a, b) => new Date(b.date) - new Date(a.date));

  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
  res.json({
    ok: true,
    count: items.length,
    ts: new Date().toISOString(),
    errors: errors.length ? errors : undefined,
    items,
  });
}
