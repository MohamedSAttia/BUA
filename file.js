import { send, session, blobGet } from './_lib.js';
export default async function handler(req, res) {
  const s = session(req); if (!s) return send(res, 401, { error: 'auth' });
  const p = new URL(req.url, 'http://x').searchParams.get('p') || '';
  if (!p.startsWith('files/') || p.includes('..')) return send(res, 400, { error: 'path' });
  const r = await blobGet(p, { access: 'private' }); if (!r) return send(res, 404, { error: 'not_found' });
  res.setHeader('Content-Type', r.blob.contentType || 'application/octet-stream'); res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Disposition', 'inline; filename*=UTF-8\'\'' + encodeURIComponent(p.split('/').pop().replace(/^[0-9a-f-]{36}-/, '')));
  const buf = Buffer.from(await new Response(r.stream).arrayBuffer()); res.end(buf);
}
