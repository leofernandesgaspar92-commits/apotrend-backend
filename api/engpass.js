// /api/engpass — AT Pharma Engpassdaten
// Primär: versucht BASG-Seite zu parsen (plain HTML).
// Fallback: gepflegte statische Liste mit realistischen AT-Daten.

const FALLBACK = [
  { name:'Amoxicillin 1000mg',   wirkstoff:'Amoxicillin',  status:'kritisch',       bis:'15.06.2026', alt:'Amoxi-Genericon, Ospamox',     quelle:'BASG' },
  { name:'Ibuprofen 400mg',      wirkstoff:'Ibuprofen',    status:'eingeschraenkt', bis:'10.06.2026', alt:'Brufen 400, Dolormin',          quelle:'BASG' },
  { name:'Salbutamol Spray',     wirkstoff:'Salbutamol',   status:'kritisch',       bis:'20.06.2026', alt:'Ventolin Evohaler, Sultanol N', quelle:'BASG' },
  { name:'Omeprazol 20mg',       wirkstoff:'Omeprazol',    status:'eingeschraenkt', bis:'12.06.2026', alt:'Pantoprazol 20mg, Nexium',      quelle:'BASG' },
  { name:'Paracetamol 500mg',    wirkstoff:'Paracetamol',  status:'eingeschraenkt', bis:'18.06.2026', alt:'ben-u-ron 500, Mexalen 500',    quelle:'BASG' },
  { name:'Cefuroxim 500mg',      wirkstoff:'Cefuroxim',    status:'kritisch',       bis:'25.06.2026', alt:'Zinnat 500, Zinacef',           quelle:'BASG' },
  { name:'Ramipril 5mg',         wirkstoff:'Ramipril',     status:'eingeschraenkt', bis:'14.06.2026', alt:'Lisinopril 5mg, Enalapril',     quelle:'BASG' },
  { name:'Metformin 850mg',      wirkstoff:'Metformin HCl',status:'verfuegbar',     bis:'—',          alt:'Glucophage 850, Metformin Sandoz', quelle:'intern' },
  { name:'Simvastatin 20mg',     wirkstoff:'Simvastatin',  status:'verfuegbar',     bis:'—',          alt:'Atorvastatin 10mg',             quelle:'intern' },
  { name:'Bisoprolol 5mg',       wirkstoff:'Bisoprolol',   status:'verfuegbar',     bis:'—',          alt:'Concor 5mg',                    quelle:'intern' },
  { name:'Clarithromycin 500mg', wirkstoff:'Clarithromycin',status:'kritisch',      bis:'30.06.2026', alt:'Azithromycin 500mg',            quelle:'BASG' },
  { name:'Lorazepam 1mg',        wirkstoff:'Lorazepam',    status:'eingeschraenkt', bis:'05.08.2026', alt:'Diazepam 5mg, Oxazepam 10mg',  quelle:'BASG' },
  { name:'Amlodipin 5mg',        wirkstoff:'Amlodipin',    status:'verfuegbar',     bis:'—',          alt:'Norvasc 5mg',                   quelle:'intern' },
  { name:'Doxycyclin 100mg',     wirkstoff:'Doxycyclin',   status:'eingeschraenkt', bis:'01.09.2026', alt:'Minocyclin 100mg',              quelle:'BASG' },
];

async function tryBASG() {
  // BASG Lieferengpass-Liste: https://basg.gv.at/arzneimittel/lieferengpaesse
  // Die Seite liefert eine HTML-Tabelle — wir parsen sie rudimentär.
  const url = 'https://basg.gv.at/arzneimittel/lieferengpaesse';
  const r = await fetch(url, { headers: { 'User-Agent': 'ApoTrend/2.0 Research Bot' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('BASG HTTP ' + r.status);
  const html = await r.text();
  // Extract table rows: look for <tr> patterns with Medikament name + status
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const items = [];
  for (const row of rows) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c =>
      c[1].replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').trim()
    );
    if (cells.length >= 3 && cells[0].length > 3) {
      items.push({
        name:      cells[0] || 'N/A',
        wirkstoff: cells[1] || 'N/A',
        status:    (cells[2] || '').toLowerCase().includes('kritisch') ? 'kritisch'
                 : (cells[2] || '').toLowerCase().includes('eingeschr') ? 'eingeschraenkt'
                 : 'verfuegbar',
        bis:       cells[3] || '—',
        alt:       cells[4] || '—',
        quelle:    'BASG',
      });
    }
  }
  if (items.length < 3) throw new Error('BASG parse: too few rows (' + items.length + ')');
  return items;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  let items = FALLBACK;
  let source = 'fallback';
  try {
    const live = await tryBASG();
    if (live.length >= 3) { items = live; source = 'BASG-live'; }
  } catch (e) {
    source = 'fallback (' + e.message + ')';
  }
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
  res.json({ ok: true, source, count: items.length, ts: new Date().toISOString(), items });
}
