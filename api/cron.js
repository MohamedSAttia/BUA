// Daily server-side automation (Vercel Cron): SLA escalation, thesis report alerts, email digest.
import crypto from 'node:crypto';
import { send, readCol, writeDoc } from './_lib.js';
const SLA = { committee: 5, head: 2, council: 7, dean: 5, college: 14, standing: 21, exec: 7, scholar: 21 };
const DAY = 864e5, days = (a, b) => Math.floor((new Date(b) - new Date(a)) / DAY);
const nid = () => 'n' + crypto.randomBytes(6).toString('hex');
export default async function handler(req, res) {
  const auth = req.headers.authorization || ''; const qs = new URL(req.url, 'http://x').searchParams.get('key');
  if (process.env.CRON_SECRET && auth !== 'Bearer ' + process.env.CRON_SECRET && qs !== process.env.CRON_SECRET) return send(res, 401, { error: 'auth' });
  const now = new Date().toISOString(); const notes = [];
  const notify = async (to, kind, text, link) => { notes.push({ to, text }); await writeDoc('notifications', nid(), { at: now, to, kind, text, link, readBy: {}, server: true }); };
  try {
    const [reqs, theses, settings, accounts] = await Promise.all([readCol('requests'), readCol('theses'), readCol('settings'), readCol('accounts')]);
    let esc = 0, th = 0;
    for (const r of reqs) {
      if (r.status !== 'open') continue; const st = r.flow?.[r.si]; const sla = SLA[st]; if (!sla) continue;
      if (days(r.stageAt, Date.now()) <= sla || (r.esc || {})[r.si]) continue;
      const msg = `تصعيد آلي (خادم): الطلب ${r.no} تجاوز المدة النظامية لمرحلته (${sla} أيام).`;
      r.esc = { ...(r.esc || {}), [r.si]: now }; r.history = [...(r.history || []), { at: now, by: 'agent:' + (r.committee || 'sla'), action: 'تصعيد آلي لتجاوز المدة', note: msg }];
      await writeDoc('requests', r.id, r); await notify('head', 'sla', msg, '#queue'); esc++;
    }
    const tp = settings.find(s => s.id === 'thParams') || {}; const repDays = tp.repDays || 120;
    for (const t of theses) {
      if (t.stage >= 6) continue; const last = (t.reports || []).slice(-1)[0]?.at || t.startAt; if (days(last, Date.now()) <= repDays) continue;
      const key = now.slice(0, 7); if ((t.alerted || {})[key]) continue; t.alerted = { ...(t.alerted || {}), [key]: now }; await writeDoc('theses', t.id, t);
      await notify(t.sup, 'thesis', `تنبيه (خادم): تقرير التقدم الدوري للرسالة «${t.title}» متأخر.`, '#theses'); th++;
    }
    let mailed = false; const head = accounts.find(a => a.id === 'head');
    if (process.env.RESEND_API_KEY && head?.email && notes.length) {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.MAIL_FROM || 'BU English Dept <onboarding@resend.dev>', to: head.email, subject: `ملخص يومي — ${notes.length} تنبيه`, html: `<div dir="rtl" style="font-family:Tahoma"><h3>الملخص اليومي لنظام قسم اللغة الإنجليزية</h3><ul>${notes.map(n => `<li>${n.text}</li>`).join('')}</ul></div>` }) });
      mailed = r.ok;
    }
    send(res, 200, { ok: true, escalated: esc, thesisAlerts: th, mailed });
  } catch (e) { send(res, 500, { error: String(e.message || e) }); }
}
