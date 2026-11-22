// Local test server that mimics Vercel: serves index.html and routes /api/* to the functions.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
process.env.BUA_LOCAL = process.env.BUA_LOCAL || '1';
const PORT = process.env.PORT || 3000;
http.createServer(async (req, res) => {
  let u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/_blob/')) { u = new URL('/api/file?p=' + encodeURIComponent(u.pathname.slice(7)), 'http://x'); req.url = u.pathname + u.search; }
  if (u.pathname.startsWith('/api/')) {
    const name = u.pathname.slice(5).replace(/[^a-z]/g, ''); const f = path.resolve('api', name + '.js');
    if (!fs.existsSync(f) || name.startsWith('_')) { res.statusCode = 404; return res.end('{}'); }
    try { const m = await import('file://' + f); return await m.default(req, res); } catch (e) { console.error(e); res.statusCode = 500; return res.end(JSON.stringify({ error: String(e) })); }
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fs.readFileSync(u.pathname.startsWith('/full') ? 'full/index.html' : 'index.html'));
}).listen(PORT, () => console.log('BUA dev server on http://localhost:' + PORT));
