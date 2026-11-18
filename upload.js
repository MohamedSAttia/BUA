import crypto from 'node:crypto';
import { send, session, blobPut } from './_lib.js';
export const config = { api: { bodyParser: false } };
const OK = /^(application\/pdf|image\/(png|jpe?g|gif|webp)|application\/msword|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|application\/vnd\.ms-excel|text\/plain|text\/csv)$/;
export default async function handler(req, res) {
  const s = session(req); if (!s) return send(res, 401, { error: 'auth' });
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  const type = String(req.headers['content-type'] || '').split(';')[0];
  if (!OK.test(type)) return send(res, 415, { code: 'unsupported_type' });
  const chunks = []; let n = 0; for await (const c of req) { n += c.length; if (n > 4.4 * 1024 * 1024) return send(res, 413, { code: 'too_large' }); chunks.push(c); }
  const name = decodeURIComponent(String(req.headers['x-filename'] || 'file')).replace(/[^\w.\-؀-ۿ ]+/g, '_').slice(-80);
  const path = `files/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${name}`;
  await blobPut(path, Buffer.concat(chunks), { access: 'private', contentType: type, addRandomSuffix: false });
  send(res, 200, { id: path });
}
