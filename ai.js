import { body, send, session } from './_lib.js';
const MODEL = process.env.AI_MODEL || 'anthropic/claude-sonnet-5.5';
export default async function handler(req, res) {
  const s = session(req); if (!s) return send(res, 401, { error: 'auth' });
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  const key = req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY;
  if (!key) return send(res, 503, { error: 'no_ai' });
  const b = await body(req); const prompt = String(b.prompt || '').slice(0, 180000); if (!prompt) return send(res, 400, { error: 'prompt' });
  try {
    const r = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }) });
    const j = await r.json(); if (!r.ok) return send(res, 502, { error: 'ai', detail: j?.error?.message || r.status });
    send(res, 200, { text: j.choices?.[0]?.message?.content || '' });
  } catch (e) { send(res, 502, { error: 'ai', detail: String(e.message || e) }); }
}
