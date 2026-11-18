// Shared helpers: auth tokens, password hashing, storage (Neon Postgres if configured, else Vercel Blob).
import crypto from 'node:crypto';
import { put as _put, get as _get, del as _del } from '@vercel/blob';
import fs from 'node:fs';
import path from 'node:path';
// Local development backend (BUA_LOCAL=1): JSON + files under .data/
const LOCAL = () => process.env.BUA_LOCAL === '1' && !process.env.BLOB_READ_WRITE_TOKEN;
const LD = () => path.join(process.cwd(), '.data');
function lpath(p) { const f = path.join(LD(), p); fs.mkdirSync(path.dirname(f), { recursive: true }); return f; }
async function put(p, data, o = {}) { if (!LOCAL()) return _put(p, data, o); const f = lpath(p); if (o.ifMatch && fs.existsSync(f) && String(fs.statSync(f).mtimeMs) !== o.ifMatch) throw new Error('precondition'); fs.writeFileSync(f, data); fs.writeFileSync(f + '.type', o.contentType || ''); return { pathname: p, etag: String(fs.statSync(f).mtimeMs) }; }
async function get(p, o = {}) { if (!LOCAL()) return _get(p, o); const f = lpath(p); if (!fs.existsSync(f)) return null; const b = fs.readFileSync(f); return { stream: new Blob([b]).stream(), blob: { etag: String(fs.statSync(f).mtimeMs), contentType: fs.existsSync(f + '.type') ? fs.readFileSync(f + '.type', 'utf8') : null } }; }
async function del(p) { if (!LOCAL()) return _del(p); }

export const COLS = ['tasks','requests','messages','notifications','standups','activities','meetings','kpis','accounts','settings','deanReports','letters','evidence','courses','surveys','theses','advising','archive','circulars','cmeetings','presence','mposts','files'];
const SECRET = () => process.env.AUTH_SECRET || process.env.BLOB_READ_WRITE_TOKEN || 'dev-secret';

// ---------- http ----------
export async function body(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8'); try { return JSON.parse(raw || '{}'); } catch { return {}; }
}
export const send = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };

// ---------- tokens ----------
const b64u = b => Buffer.from(b).toString('base64url');
export function sign(payload, ttlSec = 60 * 60 * 24 * 14) {
  const p = b64u(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec }));
  const s = crypto.createHmac('sha256', SECRET()).update(p).digest('base64url');
  return p + '.' + s;
}
export function verify(tok) {
  if (!tok || typeof tok !== 'string' || !tok.includes('.')) return null;
  const [p, s] = tok.split('.');
  const e = crypto.createHmac('sha256', SECRET()).update(p).digest('base64url');
  if (s.length !== e.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(e))) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.exp > Date.now() / 1000 ? o : null; } catch { return null; }
}
export function cookie(req, name) { const m = (req.headers.cookie || '').match(new RegExp('(?:^|; )' + name + '=([^;]+)')); return m ? decodeURIComponent(m[1]) : null; }
export function session(req) {
  const h = req.headers.authorization || ''; const t = h.startsWith('Bearer ') ? h.slice(7) : cookie(req, 'bua_t');
  const s = verify(t); return s && s.id ? s : null;
}
export function hashPw(pw, salt = crypto.randomBytes(16).toString('hex')) { return { salt, hash: crypto.scryptSync(String(pw), salt, 64).toString('hex') }; }
export function checkPw(pw, rec) { if (!rec) return false; const h = crypto.scryptSync(String(pw), rec.salt, 64); const e = Buffer.from(rec.hash, 'hex'); return h.length === e.length && crypto.timingSafeEqual(h, e); }

// ---------- storage ----------
const PG_URL = () => process.env.DATABASE_URL || process.env.POSTGRES_URL;
let _sql = null, _ready = false;
async function pg() {
  if (!_sql) { const { neon } = await import('@neondatabase/serverless'); _sql = neon(PG_URL()); }
  if (!_ready) { await _sql`create table if not exists docs (col text not null, id text not null, data jsonb, updated bigint not null, deleted boolean default false, primary key (col, id))`; _ready = true; }
  return _sql;
}
export const backend = () => PG_URL() ? 'postgres' : (process.env.BLOB_READ_WRITE_TOKEN || LOCAL()) ? 'blob' : null;

// Blob layout: db/<col>.json = {docs:{id:doc}}, db/_meta.json = {revs:{col:n}}
async function bget(path) {
  try { const r = await get(path, { access: 'private', useCache: false }); if (!r) return { data: null, etag: null };
    const txt = await new Response(r.stream).text(); return { data: JSON.parse(txt || 'null'), etag: r.blob.etag }; }
  catch (e) { if (/not.?found/i.test(String(e?.message || e?.name))) return { data: null, etag: null }; throw e; }
}
async function bput(path, data, etag) {
  const opts = { access: 'private', contentType: 'application/json', addRandomSuffix: false, cacheControlMaxAge: 60 };
  if (etag) opts.ifMatch = etag; else opts.allowOverwrite = false;
  return put(path, JSON.stringify(data), opts);
}
async function bmutate(path, fn, empty) {
  for (let i = 0; i < 8; i++) {
    const { data, etag } = await bget(path);
    const next = fn(data || structuredClone(empty));
    try { await bput(path, next, etag); return next; }
    catch (e) { if (i === 7) throw e; await new Promise(r => setTimeout(r, 40 + Math.random() * 120)); }
  }
}
let metaCache = { at: 0, v: null };
async function metaRevs() {
  if (Date.now() - metaCache.at < 1500 && metaCache.v) return metaCache.v;
  const { data } = await bget('db/_meta.json'); metaCache = { at: Date.now(), v: data?.revs || {} }; return metaCache.v;
}
const colCache = {};

// Returns {cursor, cols:{col:[docs]}} — only collections changed since cursor
export async function readChanged(cursor) {
  const be = backend();
  if (be === 'postgres') {
    const sql = await pg(); const since = Number(cursor) || 0;
    const rows = await sql`select col, max(updated) as m from docs group by col`;
    const changed = rows.filter(r => Number(r.m) > since).map(r => r.col);
    const out = {}; let max = since;
    rows.forEach(r => { max = Math.max(max, Number(r.m)); });
    if (!since) COLS.forEach(c => out[c] = []);
    for (const c of changed) { if (c.startsWith('_')) continue; const d = await sql`select data from docs where col = ${c} and not deleted`; out[c] = d.map(x => x.data); }
    return { cursor: String(max), cols: out };
  }
  const revs = await metaRevs(); let prev = {}; try { prev = cursor ? JSON.parse(cursor) : {}; } catch {}
  const out = {}; const first = !cursor;
  for (const c of COLS) {
    const r = revs[c] || 0;
    if (first || r !== (prev[c] || 0)) {
      if (!r) { out[c] = []; continue; }
      if (colCache[c]?.rev === r) { out[c] = colCache[c].docs; continue; }
      const { data } = await bget(`db/${c}.json`); const docs = Object.values(data?.docs || {}); colCache[c] = { rev: r, docs }; out[c] = docs;
    }
  }
  return { cursor: JSON.stringify(revs), cols: out };
}
export async function writeDoc(col, id, doc) {
  const be = backend();
  if (be === 'postgres') { const sql = await pg(); const now = Date.now();
    if (doc === null) await sql`update docs set deleted = true, updated = ${now} where col = ${col} and id = ${id}`;
    else await sql`insert into docs (col, id, data, updated, deleted) values (${col}, ${id}, ${JSON.stringify(doc)}, ${now}, false) on conflict (col, id) do update set data = excluded.data, updated = excluded.updated, deleted = false`;
    return; }
  await bmutate(`db/${col}.json`, d => { d.docs = d.docs || {}; if (doc === null) delete d.docs[id]; else d.docs[id] = doc; return d; }, { docs: {} });
  await bmutate('db/_meta.json', m => { m.revs = m.revs || {}; m.revs[col] = (m.revs[col] || 0) + 1; return m; }, { revs: {} });
  metaCache.at = 0;
}
export async function readCol(col) {
  const be = backend();
  if (be === 'postgres') { const sql = await pg(); return (await sql`select data from docs where col = ${col} and not deleted`).map(x => x.data); }
  const { data } = await bget(`db/${col}.json`); return Object.values(data?.docs || {});
}
export async function readOne(col, id) {
  const be = backend();
  if (be === 'postgres') { const sql = await pg(); const r = await sql`select data from docs where col = ${col} and id = ${id} and not deleted`; return r[0]?.data || null; }
  const { data } = await bget(`db/${col}.json`); return data?.docs?.[id] || null;
}
export { put as blobPut, get as blobGet, del as blobDel };
