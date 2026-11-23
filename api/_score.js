// Shared core for the simplified system — used by the server (api/s.js) and by the in-browser demo store.
export const MODS = [
  { k: 'req', n: 'الطلبات وخط السير', ap: true, g: 'العمل اليومي' },
  { k: 'task', n: 'المتابعة والمهام', g: 'العمل اليومي' },
  { k: 'meet', n: 'الاجتماعات', g: 'العمل اليومي' },
  { k: 'com', n: 'اللجان', g: 'التنظيم' },
  { k: 'dec', n: 'القرارات والتعاميم', g: 'التنظيم' },
  { k: 'let', n: 'الخطابات', ap: true, g: 'التنظيم' },
  { k: 'pol', n: 'الأدلة والسياسات', g: 'التنظيم' },
  { k: 'kpi', n: 'مؤشرات الأداء', g: 'الأداء' },
  { k: 'rep', n: 'التقارير', viewOnly: true, g: 'الأداء' }
];
export const PRESETS = {
  full: { n: 'صلاحيات كاملة', p: () => Object.fromEntries(MODS.map(m => [m.k, { v: 1, a: m.viewOnly ? 0 : 1, e: m.viewOnly ? 0 : 1, d: m.viewOnly ? 0 : 1, ap: m.ap ? 1 : 0 }])) },
  lead: { n: 'قيادي (عميد / رئيس قسم)', p: () => Object.fromEntries(MODS.map(m => [m.k, { v: 1, a: m.viewOnly ? 0 : 1, e: m.viewOnly ? 0 : 1, d: 0, ap: m.ap ? 1 : 0 }])) },
  staff: { n: 'موظف / عضو', p: () => ({ req: { v: 1, a: 1, e: 0, d: 0, ap: 0 }, task: { v: 1, a: 0, e: 0, d: 0 }, meet: { v: 1, a: 0, e: 0, d: 0 }, com: { v: 1 }, dec: { v: 1 }, let: { v: 0 }, pol: { v: 1 }, kpi: { v: 1, a: 0, e: 0, d: 0 }, rep: { v: 0 } }) },
  view: { n: 'اطلاع فقط', p: () => Object.fromEntries(MODS.map(m => [m.k, { v: m.k === 'rep' ? 0 : 1, a: 0, e: 0, d: 0, ap: 0 }])) }
};
const COL = { req: 's_req', task: 's_task', kpi: 's_kpi', meet: 's_meet', com: 's_com', dec: 's_dec', let: 's_let', pol: 's_pol' };
export const FLOW = ['تقديم الطلب', 'عند رئيس القسم', 'عند العميد', 'معتمد'];
export const PENDING = ['عند رئيس القسم', 'عند العميد'];
const ADMIN_ID = 'khaled';
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clean = (s, n = 400) => String(s ?? '').slice(0, n);
export const can = (u, mod, p) => !!(u && u.active !== false && (u.admin || u.perms?.[mod]?.[p]));
const pub = u => u && ({ id: u.id, name: u.name, title: u.title || '', email: u.email || '', admin: !!u.admin, active: u.active !== false, perms: u.perms || {}, preset: u.preset || '' });

const FIELDS = {
  req: ['title', 'type', 'applicant', 'details', 'status', 'due', 'priority', 'note'],
  task: ['title', 'owner', 'due', 'status', 'priority', 'details', 'progress', 'com', 'meet'],
  meet: ['title', 'date', 'time', 'place', 'com', 'attendees', 'agenda', 'minutes', 'status'],
  com: ['name', 'chair', 'members', 'mission', 'color'],
  dec: ['title', 'no', 'date', 'until', 'body', 'audience'],
  let: ['subject', 'to', 'body', 'ref', 'status'],
  pol: ['title', 'cat', 'body'],
  kpi: ['name', 'target', 'actual', 'unit', 'period', 'better', 'owner']
};

async function notify(store, to, text, mod, ref) {
  try { for (const t of [...new Set(to)].filter(Boolean)) {
    const id = rid(); await store.writeDoc('s_notif', id, { id, to: t, text: clean(text, 200), mod, ref, at: Date.now(), read: false });
  } } catch (e) { console.error('notify failed', e); }
}
async function log(store, by, act, mod, ref, title) { try { const id = rid(); await store.writeDoc('s_log', id, { id, by, act, mod, ref, title: clean(title, 120), at: Date.now() }); } catch (e) { console.error('log write failed', e); } }

export async function ensureAdmin(store, hp, adminPw) {
  const u = await store.readOne('s_users', ADMIN_ID);
  if (u) return u;
  if (!adminPw) return null;
  const doc = { id: ADMIN_ID, name: 'د. خالد البلوي', title: 'مدير النظام', email: '', admin: true, active: true, perms: PRESETS.full.p(), preset: 'full', at: Date.now() };
  await store.writeDoc('s_users', ADMIN_ID, doc);
  await store.writeDoc('_s_auth', ADMIN_ID, { id: ADMIN_ID, ...(await hp.hash(adminPw)) });
  return doc;
}

export async function handle(store, hp, sessId, act, b) {
  b = b || {};
  if (act === 'login') {
    const id = clean(b.user, 60).trim().toLowerCase().replace(/^@/, '');
    let u = await store.readOne('s_users', id);
    if (!u) { const all = await store.readCol('s_users'); u = all.find(x => (x.email || '').toLowerCase() === id) || null; }
    if (!u && id === ADMIN_ID) { try { u = await ensureAdmin(store, hp, hp.adminPw); } catch (e) { console.error('ensureAdmin failed', e); if (String(b.pass || '').trim() === hp.adminPw) u = { id: ADMIN_ID, name: 'د. خالد البلوي', admin: true, active: true, perms: PRESETS.full.p() }; } }
    if (!u || u.active === false) return { status: 401, body: { error: 'bad' } };
    const pass = String(b.pass || '').trim();
    let rec = await store.readOne('_s_auth', u.id);
    // the administrator's password follows S_ADMIN_PASSWORD: when that setting changes, the new value takes effect once
    if (u.id === ADMIN_ID && hp.adminPw && hp.tag) {
      const tag = await hp.tag(hp.adminPw);
      if (!rec || rec.envTag !== tag) {
        if (pass !== hp.adminPw) return { status: 401, body: { error: 'bad' } };
        rec = { id: ADMIN_ID, ...(await hp.hash(hp.adminPw)), envTag: tag };
        try { await store.writeDoc('_s_auth', ADMIN_ID, rec); } catch (e) { console.error('admin password sync failed', e); }
      }
    }
    if (!rec || !(await hp.check(pass, rec))) return { status: 401, body: { error: 'bad' } };
    await log(store, u.id, 'login', 'sys', '', 'تسجيل دخول');
    return { status: 200, body: { ok: true, id: u.id, mustChange: !!rec.temp }, session: u.id };
  }
  if (act === 'logout') return { status: 200, body: { ok: true }, session: null };
  const me = sessId ? await store.readOne('s_users', sessId) : null;
  if (!me || me.active === false) return { status: 401, body: { error: 'auth' } };

  if (act === 'boot') {
    // upgrade data from the earlier version and load the demo once when the store is empty
    try {
    const MAP = { 'جديد': 'عند رئيس القسم', 'قيد الدراسة': 'عند العميد' };
    for (const r of await store.readCol('s_req')) if (MAP[r.status]) {
      const st = MAP[r.status]; const hist = [{ s: 'تقديم الطلب', by: r.by, at: r.at || Date.now() }, { s: 'عند رئيس القسم', by: r.by, at: (r.at || Date.now()) + 3e5 }];
      if (st === 'عند العميد') hist.push({ s: 'عند العميد', by: r.by, at: (r.at || Date.now()) + 864e5 });
      await store.writeDoc('s_req', r.id, { ...r, status: st, hist });
    }
    if (me.preset && PRESETS[me.preset]) { const full = PRESETS[me.preset].p(); const miss = Object.keys(full).filter(k => !(me.perms || {})[k]);
      if (miss.length) { me.perms = { ...(me.perms || {}) }; for (const k of miss) me.perms[k] = full[k]; await store.writeDoc('s_users', me.id, me); } }
    if (me.admin && !(await store.readOne('s_meta', 'demo2'))) {
      if (!(await store.readCol('s_com')).length && !(await store.readCol('s_pol')).length && (await store.readCol('s_req')).length) await seedExtras(store, me.id);
      await store.writeDoc('s_meta', 'demo2', { id: 'demo2', at: Date.now() });
    }
    const meta = await store.readOne('s_meta', 'demo');
    if (!meta && me.admin) {
      const [rq, tk] = [await store.readCol('s_req'), await store.readCol('s_task')];
      if (!rq.length && !tk.length) await seed(store, me.id);
      await store.writeDoc('s_meta', 'demo', { id: 'demo', at: Date.now() });
    }
    } catch (e) { console.error('boot upgrade failed', e); }
    const out = { me: pub(me), mods: MODS, presets: Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.n])) };
    for (const [m, c] of Object.entries(COL)) if (can(me, m, 'v') || (m === 'task')) {
      let docs = await store.readCol(c);
      if (!can(me, m, 'v')) docs = docs.filter(d => d.owner === me.id); // tasks assigned to me are always visible
      out[m] = docs;
    }
    const users = await store.readCol('s_users');
    out.people = users.filter(u => u.active !== false).map(u => ({ id: u.id, name: u.name, title: u.title || '' }));
    if (me.admin) out.users = users.map(pub);
    out.org = (await store.readOne('s_meta', 'org')) || { name: 'القسم' };
    out.notif = (await store.readCol('s_notif')).filter(n => n.to === me.id).sort((a, b) => b.at - a.at).slice(0, 60);
    if (me.admin || can(me, 'rep', 'v')) out.log = (await store.readCol('s_log')).sort((a, b) => b.at - a.at).slice(0, 40);
    return { status: 200, body: out };
  }
  if (act === 'save') {
    const m = b.mod, c = COL[m]; if (!c) return { status: 400, body: { error: 'mod' } };
    const d = b.doc || {}; const old = d.id ? await store.readOne(c, d.id) : null;
    const isOwnTask = m === 'task' && old && old.owner === me.id;
    const isOwnReturned = m === 'req' && old && old.by === me.id && old.status === 'معاد للاستكمال';
    if (old ? !(can(me, m, 'e') || isOwnTask || isOwnReturned || (m === 'req' && can(me, m, 'ap'))) : !can(me, m, 'a')) return { status: 403, body: { error: 'forbidden' } };
    const doc = { ...(old || {}), id: old?.id || rid() };
    for (const f of FIELDS[m]) if (f in d) doc[f] = clean(d[f], ['body', 'details', 'agenda', 'minutes', 'mission'].includes(f) ? 4000 : 300);
    // approval changes need approval permission
    if (m === 'req' && old && d.status && d.status !== old.status && !can(me, 'req', 'ap') && !(isOwnReturned && d.status === 'عند رئيس القسم')) return { status: 403, body: { error: 'forbidden' } };
    if (m === 'req' && isOwnReturned && !can(me, 'req', 'e') && !can(me, 'req', 'ap')) doc.status = 'عند رئيس القسم';
    if (isOwnTask && !can(me, m, 'e')) { for (const f of FIELDS.task) if (!['status', 'progress'].includes(f)) doc[f] = old[f]; }
    if (!old) { doc.by = me.id; doc.at = Date.now(); if (m === 'req') doc.status = 'عند رئيس القسم'; if (m === 'task' && !doc.status) doc.status = 'لم تبدأ'; }
    if (m === 'let') {
      if (!old) doc.status = 'مسودة';
      if (old && d.status === 'معتمد' && old.status !== 'معتمد') { if (!can(me, 'let', 'ap')) return { status: 403, body: { error: 'forbidden' } }; doc.status = 'معتمد'; doc.signedBy = me.id; doc.signedAt = Date.now(); doc.no = doc.no || ('خ/' + new Date().getFullYear() + '/' + String(Math.floor(Math.random() * 900) + 100)); }
      else if (old && old.status === 'معتمد') { doc.status = 'معتمد'; for (const f of FIELDS.let) if (f !== 'status') doc[f] = old[f]; }
    }
    if (m === 'meet' && !old && !doc.status) doc.status = 'مجدول';
    doc.upd = Date.now(); doc.updBy = me.id;
    if (m === 'req' && old && doc.status !== old.status) { doc.hist = [...(old.hist || []), { s: doc.status, by: me.id, at: Date.now(), note: clean(d.note, 300) }]; }
    if (m === 'req' && !old) doc.hist = [{ s: 'تقديم الطلب', by: me.id, at: Date.now() }, { s: doc.status, by: me.id, at: Date.now() }];
    await store.writeDoc(c, doc.id, doc);
    await log(store, me.id, old ? 'edit' : 'add', m, doc.id, doc.title || doc.name);
    // notifications
    const users = (await store.readCol('s_users')).filter(u => u.active !== false && u.id !== me.id);
    if (m === 'task' && doc.owner && (!old || old.owner !== doc.owner) && doc.owner !== me.id) await notify(store, [doc.owner], 'أُسندت إليك مهمة: ' + doc.title, 'task', doc.id);
    if (m === 'task' && old && old.status !== doc.status && doc.by && doc.by !== me.id) await notify(store, [doc.by], `تحديث مهمة «${doc.title}»: ${doc.status}`, 'task', doc.id);
    if (m === 'req' && !old) await notify(store, users.filter(u => can(u, 'req', 'ap')).map(u => u.id), 'طلب جديد بانتظار قرارك: ' + doc.title, 'req', doc.id);
    if (m === 'req' && old && old.status !== doc.status && PENDING.includes(doc.status)) await notify(store, users.filter(u => can(u, 'req', 'ap')).map(u => u.id), `طلب «${doc.title}» وصل إلى: ${doc.status}`, 'req', doc.id);
    if (m === 'req' && old && old.status !== doc.status && doc.by !== me.id) await notify(store, [doc.by], `طلبك «${doc.title}» أصبح: ${doc.status}`, 'req', doc.id);
    if (m === 'meet' && !old) await notify(store, String(doc.attendees || '').split(',').filter(x => x && x !== me.id), `دعوة لاجتماع: ${doc.title} — ${doc.date || ''} ${doc.time || ''}`, 'meet', doc.id);
    if (m === 'dec' && !old) await notify(store, users.filter(u => can(u, 'dec', 'v')).map(u => u.id), 'قرار / تعميم جديد: ' + doc.title, 'dec', doc.id);
    if (m === 'let' && !old) await notify(store, users.filter(u => can(u, 'let', 'ap')).map(u => u.id), 'خطاب بانتظار التوقيع: ' + doc.subject, 'let', doc.id);
    if (m === 'let' && old && old.status !== 'معتمد' && doc.status === 'معتمد' && doc.by !== me.id) await notify(store, [doc.by], 'تم توقيع الخطاب: ' + doc.subject, 'let', doc.id);
    if (m === 'com' && doc.chair && (!old || old.chair !== doc.chair) && doc.chair !== me.id) await notify(store, [doc.chair], 'تم تعيينك رئيساً لـ ' + doc.name, 'com', doc.id);
    if (m === 'kpi') { const t = +doc.target, a = +doc.actual; const bad = isFinite(t) && isFinite(a) && (doc.better === 'low' ? a > t : a < t);
      if (bad) await notify(store, users.filter(u => u.admin || can(u, 'kpi', 'e')).map(u => u.id), `مؤشر دون المستهدف: ${doc.name} (${a} من ${t})`, 'kpi', doc.id); }
    return { status: 200, body: { ok: true, doc } };
  }
  if (act === 'del') {
    const m = b.mod, c = COL[m]; if (!c || !can(me, m, 'd')) return { status: 403, body: { error: 'forbidden' } };
    const old = await store.readOne(c, b.id); await store.writeDoc(c, b.id, null); await log(store, me.id, 'del', m, b.id, old?.title || old?.name);
    return { status: 200, body: { ok: true } };
  }
  if (act === 'read') { // mark notifications read
    const all = (await store.readCol('s_notif')).filter(n => n.to === me.id && !n.read && (!b.id || n.id === b.id));
    for (const n of all) await store.writeDoc('s_notif', n.id, { ...n, read: true });
    return { status: 200, body: { ok: true } };
  }
  if (act === 'pw') {
    if (String(b.pass || '').length < 10) return { status: 400, body: { error: 'weak' } };
    const rec = await store.readOne('_s_auth', me.id);
    if (!rec || !(await hp.check(String(b.old || ''), rec))) return { status: 401, body: { error: 'old' } };
    await store.writeDoc('_s_auth', me.id, { id: me.id, ...(await hp.hash(b.pass)), envTag: rec.envTag }); return { status: 200, body: { ok: true } };
  }
  // ---- administration ----
  if (!me.admin) return { status: 403, body: { error: 'forbidden' } };
  if (act === 'user') {
    const u = b.user || {}; const id = clean(u.id, 40).trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (!id) return { status: 400, body: { error: 'id' } };
    const old = await store.readOne('s_users', id);
    if (!old && !b.pass) return { status: 400, body: { error: 'pass' } };
    if (b.pass && String(b.pass).length < 10) return { status: 400, body: { error: 'weak' } };
    const doc = { ...(old || {}), id, name: clean(u.name, 80) || id, title: clean(u.title, 80), email: clean(u.email, 120), preset: clean(u.preset, 20),
      admin: id === ADMIN_ID ? true : !!u.admin, active: id === ADMIN_ID ? true : u.active !== false, perms: u.perms || old?.perms || PRESETS.view.p(), at: old?.at || Date.now() };
    await store.writeDoc('s_users', id, doc);
    if (b.pass) await store.writeDoc('_s_auth', id, { id, ...(await hp.hash(b.pass)), temp: !!b.temp });
    await log(store, me.id, old ? 'edit' : 'add', 'users', id, doc.name);
    if (!old) await notify(store, [id], 'مرحباً بك في النظام، تم إنشاء حسابك', 'sys', '');
    else if (JSON.stringify(old.perms) !== JSON.stringify(doc.perms)) await notify(store, [id], 'تم تحديث صلاحياتك في النظام', 'sys', '');
    return { status: 200, body: { ok: true, user: pub(doc) } };
  }
  if (act === 'userDel') {
    if (b.id === ADMIN_ID) return { status: 400, body: { error: 'admin' } };
    await store.writeDoc('s_users', b.id, null); await store.writeDoc('_s_auth', b.id, null); await log(store, me.id, 'del', 'users', b.id, b.id);
    return { status: 200, body: { ok: true } };
  }
  if (act === 'org') { const o = { id: 'org', name: clean(b.name, 120) || 'القسم', sub: clean(b.sub, 120) }; await store.writeDoc('s_meta', 'org', o); return { status: 200, body: { ok: true } }; }
  if (act === 'seed') { await seed(store, me.id); await log(store, me.id, 'add', 'sys', '', 'تحميل بيانات تجريبية'); return { status: 200, body: { ok: true } }; }
  if (act === 'wipe') {
    for (const c of Object.values(COL)) for (const d of await store.readCol(c)) await store.writeDoc(c, d.id, null);
    for (const n of await store.readCol('s_notif')) await store.writeDoc('s_notif', n.id, null);
    await log(store, me.id, 'del', 'sys', '', 'مسح بيانات العرض'); return { status: 200, body: { ok: true } };
  }
  return { status: 400, body: { error: 'act' } };
}

export async function seed(store, by) {
  const day = 864e5, now = Date.now(), d = n => new Date(now + n * day).toISOString().slice(0, 10);
  const W = async (c, o) => { const id = rid(); await store.writeDoc(c, id, { id, by, at: now - Math.random() * 6 * day, upd: now, ...o }); };
  const R = [['اعتماد خطة الفصل الدراسي الثاني', 'أكاديمي', 'عند العميد', 2, 'عالية'], ['طلب تكليف أستاذ متعاون', 'موارد بشرية', 'عند رئيس القسم', 5, 'متوسطة'], ['اعتماد نتائج الاختبارات النهائية', 'أكاديمي', 'معتمد', -3, 'عالية'],
    ['شراء أجهزة لمعمل اللغات', 'مالي', 'عند العميد', -1, 'متوسطة'], ['طلب إجازة علمية', 'موارد بشرية', 'عند رئيس القسم', 7, 'منخفضة'], ['تعديل جدول المحاضرات', 'أكاديمي', 'مرفوض', -6, 'منخفضة'], ['مشاركة في مؤتمر دولي', 'بحثي', 'معتمد', -10, 'متوسطة'], ['طلب دعم نشر بحث', 'بحثي', 'معاد للاستكمال', 3, 'متوسطة']];
  for (const [title, type, status, due, priority] of R) { const i = FLOW.indexOf(status), t0 = now - (4 + Math.random() * 4) * day;
    const hist = [{ s: 'تقديم الطلب', by, at: t0 }, { s: 'عند رئيس القسم', by, at: t0 + 3e5 }];
    if (i >= 2 || status === 'مرفوض') hist.push({ s: 'عند العميد', by, at: t0 + 1.2 * day, note: 'تمت المراجعة وإحالته للعميد' });
    if (i >= 3) hist.push({ s: 'معتمد', by, at: t0 + 2.5 * day });
    if (status === 'مرفوض') hist.push({ s: 'مرفوض', by, at: t0 + 2.4 * day, note: 'يتعارض مع الجدول المعتمد' });
    if (status === 'معاد للاستكمال') hist.push({ s: 'معاد للاستكمال', by, at: t0 + day, note: 'يرجى إرفاق خطاب القبول' });
    await W('s_req', { title, type, applicant: ['د. أحمد', 'د. سارة', 'أ. محمد', 'د. نورة'][Math.floor(Math.random() * 4)], status, due: d(due), priority, details: '', hist, at: t0 }); }
  const T = [['إعداد تقرير الأداء الفصلي', 'جارية', 4, 60, 'عالية'], ['تحديث توصيف المقررات', 'جارية', -2, 40, 'عالية'], ['متابعة استبانات رضا الطلاب', 'مكتملة', -5, 100, 'متوسطة'], ['تجهيز ملفات الاعتماد', 'لم تبدأ', 10, 0, 'عالية'],
    ['جدولة اجتماع مجلس القسم', 'مكتملة', -1, 100, 'منخفضة'], ['حصر احتياجات التدريب', 'جارية', 6, 30, 'متوسطة'], ['مراجعة توزيع الأعباء التدريسية', 'لم تبدأ', -1, 0, 'عالية']];
  for (const [title, status, due, progress, priority] of T) await W('s_task', { title, status, due: d(due), progress: String(progress), priority, owner: by });
  const K = [['نسبة إنجاز المعاملات في وقتها', 90, 78, '%', 'high'], ['متوسط زمن إنجاز الطلب', 5, 7, 'يوم', 'low'], ['رضا الطلاب عن المقررات', 85, 88, '%', 'high'], ['نسبة المهام المكتملة', 80, 64, '%', 'high'], ['نسبة حضور الاجتماعات', 90, 93, '%', 'high'], ['الأبحاث المنشورة هذا العام', 12, 9, 'بحث', 'high']];
  await seedExtras(store, by);
  for (const [name, target, actual, unit, better] of K) await W('s_kpi', { name, target: String(target), actual: String(actual), unit, better, period: 'الفصل الأول 1448' });
}

export async function seedExtras(store, by) {
  const day = 864e5, now = Date.now(), d = n => new Date(now + n * day).toISOString().slice(0, 10);
  const W = async (c, o) => { const id = rid(); await store.writeDoc(c, id, { id, by, at: now - Math.random() * 6 * day, upd: now, ...o }); };
  const ids = (await store.readCol('s_users')).map(u => u.id); const pick = (n, o = 0) => ids.length ? ids.slice(o, o + n).join(',') || by : by;
  const C = [['لجنة الجداول والاختبارات', 'تنظيم الجداول الدراسية ومواعيد الاختبارات ومتابعة رصد الدرجات.', '#3B82F6'], ['لجنة الجودة والتطوير', 'متابعة مؤشرات الأداء وخطط التحسين وتجهيز ملفات الجودة.', '#34C38F'], ['لجنة الإرشاد الأكاديمي', 'متابعة الطلاب المتعثرين وتوزيع المرشدين والساعات المكتبية.', '#F2B54E'], ['لجنة الأنشطة والشراكات', 'تنظيم الأنشطة الطلابية والفعاليات والشراكات مع المجتمع.', '#A78BFA']];
  const comIds = [];
  for (const [name, mission, color] of C) { const id = rid(); comIds.push(id); await store.writeDoc('s_com', id, { id, name, mission, color, chair: by, members: pick(3, comIds.length - 1), by, at: now, upd: now }); }
  const M = [['اجتماع مجلس القسم الدوري', 2, '10:00', 'قاعة الاجتماعات', '', 'مجدول', '1. متابعة خطة الفصل\n2. الطلبات المعلقة\n3. ما يستجد'], ['اجتماع لجنة الجداول', 5, '11:30', 'عن بُعد', comIds[0], 'مجدول', '1. مسودة جدول الاختبارات النهائية'], ['اجتماع لجنة الجودة', -4, '09:00', 'مكتب رئيس القسم', comIds[1], 'منعقد', '1. مراجعة مؤشرات الفصل']];
  for (const [title, dd, time, place, com, status, agenda] of M) await W('s_meet', { title, date: d(dd), time, place, com, status, agenda, attendees: pick(4), minutes: status === 'منعقد' ? 'تمت مراجعة المؤشرات، والاتفاق على رفع نسبة إنجاز المهام قبل نهاية الشهر.' : '' });
  const DC = [['تفعيل المتابعة الإلكترونية لأعمال القسم', '12/1448', -20, 200], ['مواعيد رفع درجات أعمال الفصل', '15/1448', -8, 30], ['تشكيل فريق متابعة مؤشرات الأداء', '18/1448', -2, 365]];
  for (const [title, no, ago, dur] of DC) await W('s_dec', { title, no, date: d(ago), until: d(ago + dur), body: 'نص القرار يُكتب هنا بإيجاز، مع تاريخ السريان والجهات المعنية بالتنفيذ.', audience: 'جميع منسوبي القسم' });
  await W('s_let', { subject: 'طلب تكليف أستاذ متعاون', to: 'سعادة عميد الكلية', body: 'السلام عليكم ورحمة الله وبركاته،\n\nنفيد سعادتكم بحاجة القسم إلى تكليف أستاذ متعاون لتدريس المقررات الشاغرة للفصل القادم، ونأمل التكرم بالموافقة.\n\nوتقبلوا خالص التحية والتقدير.', status: 'مسودة' });
  await W('s_let', { subject: 'إفادة بإنهاء المهام', to: 'من يهمه الأمر', body: 'يفيد القسم بأن صاحب الطلب قد أنهى المهام المكلف بها خلال الفصل الدراسي.\n\nوقد أعطيت له هذه الإفادة بناءً على طلبه.', status: 'معتمد', signedBy: by, signedAt: now - day, no: 'خ/2026/214' });
  const PO = [['مدة الرد على الطلبات', 'الطلبات', 'يُرد على كل طلب خلال ثلاثة أيام عمل من وصوله إلى كل مرحلة، وإذا تجاوزها يظهر تنبيه تلقائي للمسؤول.'], ['مسار اعتماد الطلبات', 'الطلبات', 'يمر الطلب برئيس القسم ثم العميد. يجوز إعادة الطلب لصاحبه للاستكمال مع ذكر السبب.'], ['إسناد المهام ومتابعتها', 'المهام', 'لكل مهمة مسؤول واحد وموعد محدد. يحدّث المسؤول نسبة الإنجاز أسبوعياً على الأقل.'], ['محاضر الاجتماعات', 'الاجتماعات', 'يُرفع المحضر خلال يومين من الاجتماع، وتُحوَّل كل توصية إلى مهمة بمسؤول وموعد.'], ['توقيع الخطابات', 'الخطابات', 'لا يصدر الخطاب إلا بعد اعتماده من صاحب الصلاحية، ويُحفظ برقم وتاريخ.']];
  for (const [title, cat, body] of PO) await W('s_pol', { title, cat, body });
}
