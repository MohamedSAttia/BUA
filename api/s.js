import { body, send, sign, verify, cookie, hashPw, checkPw, readOne, readCol, writeDoc, backend } from './_lib.js';
import { handle } from './_score.js';

const store = { readOne, readCol, writeDoc };
const hp = { hash: async pw => hashPw(pw), check: async (pw, rec) => checkPw(pw, rec), adminPw: process.env.S_ADMIN_PASSWORD || '' };
const attempts = new Map();
const ck = (t, age) => `bs_t=${t}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  if (!backend()) return send(res, 503, { error: 'no_storage' });
  const b = await body(req); const act = String(b.act || '');
  const ip = String(req.headers['x-forwarded-for'] || 'x').split(',')[0];
  if (act === 'login') { const k = ip + '|' + String(b.user).toLowerCase(); if ((attempts.get(k) || 0) > 6) return send(res, 429, { error: 'too_many' }); }
  const tok = cookie(req, 'bs_t'); const s = tok ? verify(tok) : null;
  try {
    const r = await handle(store, hp, s?.sid || null, act, b);
    if (act === 'login') { const k = ip + '|' + String(b.user).toLowerCase(); if (r.status === 200) attempts.delete(k); else attempts.set(k, (attempts.get(k) || 0) + 1); }
    if ('session' in r) res.setHeader('Set-Cookie', r.session ? ck(sign({ sid: r.session }, 60 * 60 * 12), 60 * 60 * 12) : ck('', 0));
    return send(res, r.status, r.body);
  } catch (e) { return send(res, 500, { error: 'server', detail: String(e.message || e) }); }
}
