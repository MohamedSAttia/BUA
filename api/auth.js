import crypto from 'node:crypto';
import { body, send, sign, session, hashPw, checkPw, readOne, readCol, writeDoc } from './_lib.js';
const FIXED_RE = /^(head|dean|fac|stu[0-9]|ch_[a-z]+)$/;
const attempts = new Map();
const cookieHdr = (t, maxAge) => `bua_t=${t}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
async function resolveUser(u) {
  u = String(u || '').trim().toLowerCase(); if (!u) return null;
  if (FIXED_RE.test(u)) return u;
  const accs = await readCol('accounts');
  const a = accs.find(x => x.id?.toLowerCase() === u || (x.email || '').toLowerCase() === u || (x.username || '').toLowerCase() === u);
  return a ? a.id : null;
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  const b = await body(req); const ip = req.headers['x-forwarded-for'] || 'x';
  try {
    if (b.action === 'login') {
      const k = ip + '|' + b.user; const n = attempts.get(k) || 0; if (n > 8) return send(res, 429, { error: 'too_many' });
      const id = await resolveUser(b.user); if (!id) { attempts.set(k, n + 1); return send(res, 401, { error: 'bad' }); }
      const rec = await readOne('_auth', id);
      let ok = rec ? checkPw(b.password, rec) : (id === 'head' && process.env.ADMIN_PASSWORD && String(b.password) === process.env.ADMIN_PASSWORD);
      if (!ok) { attempts.set(k, n + 1); return send(res, 401, { error: 'bad' }); }
      attempts.delete(k);
      const t = sign({ id }); res.setHeader('Set-Cookie', cookieHdr(t, 60 * 60 * 24 * 14));
      return send(res, 200, { token: t, id, mustChange: !rec || !!rec.temp });
    }
    if (b.action === 'logout') { res.setHeader('Set-Cookie', cookieHdr('', 0)); return send(res, 200, { ok: true }); }
    const s = session(req); if (!s) return send(res, 401, { error: 'auth' });
    if (b.action === 'change') {
      if (!b.password || String(b.password).length < 8) return send(res, 400, { error: 'weak' });
      const rec = await readOne('_auth', s.id);
      const okOld = rec ? checkPw(b.old, rec) : (s.id === 'head' && b.old === process.env.ADMIN_PASSWORD);
      if (!okOld) return send(res, 401, { error: 'old' });
      await writeDoc('_auth', s.id, { id: s.id, ...hashPw(b.password), at: Date.now() }); return send(res, 200, { ok: true });
    }
    if (b.action === 'reset') { // head sets a temporary password for any account
      if (s.id !== 'head') return send(res, 403, { error: 'forbidden' });
      const temp = b.password && String(b.password).length >= 8 ? String(b.password) : crypto.randomBytes(6).toString('base64url');
      await writeDoc('_auth', b.id, { id: b.id, ...hashPw(temp), temp: true, at: Date.now() });
      return send(res, 200, { ok: true, temp });
    }
    if (b.action === 'status') { // which accounts have passwords (head only)
      if (s.id !== 'head') return send(res, 403, { error: 'forbidden' });
      const recs = await readCol('_auth'); return send(res, 200, { set: recs.map(r => ({ id: r.id, temp: !!r.temp })) });
    }
    return send(res, 400, { error: 'action' });
  } catch (e) { return send(res, 500, { error: 'server', detail: String(e.message || e) }); }
}
