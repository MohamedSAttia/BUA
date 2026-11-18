import { body, send, session, readChanged, writeDoc, readOne, COLS, backend } from './_lib.js';
export default async function handler(req, res) {
  const s = session(req); if (!s) return send(res, 401, { error: 'auth' });
  if (!backend()) return send(res, 503, { error: 'no_storage' });
  try {
    if (req.method === 'GET') {
      const u = new URL(req.url, 'http://x');
      if (u.searchParams.get('col') && u.searchParams.get('id')) { const c = u.searchParams.get('col'); if (!COLS.includes(c)) return send(res, 400, { error: 'col' }); return send(res, 200, { doc: await readOne(c, u.searchParams.get('id')) }); }
      return send(res, 200, { me: s.id, ...(await readChanged(u.searchParams.get('cursor') || '')) });
    }
    if (req.method === 'POST') {
      const b = await body(req); if (!COLS.includes(b.col) || !b.id || String(b.id).length > 120) return send(res, 400, { error: 'bad' });
      if (b.doc && JSON.stringify(b.doc).length > 900000) return send(res, 413, { error: 'too_large' });
      await writeDoc(b.col, String(b.id), b.delete ? null : { ...b.doc, id: String(b.id) }); return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'method' });
  } catch (e) { return send(res, 500, { error: 'server', detail: String(e.message || e) }); }
}
