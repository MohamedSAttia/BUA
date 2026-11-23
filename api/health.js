import { backend, send } from './_lib.js';
export default function handler(req, res) {
  send(res, 200, { ok: true, backend: backend(), ai: !!(req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY), email: !!process.env.RESEND_API_KEY, version: '8.5' });
}
