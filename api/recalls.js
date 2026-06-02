// /api/recalls — echte FDA-Rückrufe (openFDA, kein API-Key nötig)
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  try {
    const limit = parseInt(req.query.limit) || 20;
    const url = `https://api.fda.gov/drug/enforcement.json?search=status:Ongoing&limit=${limit}&sort=report_date:desc`;
    const r = await fetch(url, { headers: { 'User-Agent': 'ApoTrend/2.0' } });
    if (!r.ok) throw new Error('FDA API ' + r.status);
    const data = await r.json();
    const items = (data.results || []).map(d => ({
      date:        d.report_date   || '',
      product:     d.product_description?.slice(0, 80) || d.brand_name || 'N/A',
      reason:      d.reason_for_recall?.slice(0, 120) || 'N/A',
      status:      d.status        || 'Ongoing',
      country:     d.country       || 'US',
      firm:        d.recalling_firm?.slice(0, 40) || 'N/A',
      class:       d.classification || '',
    }));
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.json({ ok: true, count: items.length, source: 'openFDA', items });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
}
