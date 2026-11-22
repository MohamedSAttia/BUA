// Shared core for the simplified system — used by the server (api/s.js) and by the in-browser demo store.
export const MODS = [
  { k: 'req', n: 'الطلبات وخط السير', ap: true },
  { k: 'task', n: 'المتابعة والمهام' },
  { k: 'kpi', n: 'مؤشرات الأداء' },
  { k: 'rep', n: 'التقارير', viewOnly: true }
];
export const PRESETS = {
  full: { n: 'صلاحيات كاملة', p: () => Object.fromEntries(MODS.map(m => [m.k, { v: 1, a: m.viewOnly ? 0 : 1, e: m.viewOnly ? 0 : 1, d: m.viewOnly ? 0 : 1, ap: m.ap ? 1 : 0 }])) },
  lead: { n: 'قيادي (عميد / رئيس قسم)', p: () => Object.fromEntries(MODS.map(m => [m.k, { v: 1, a: m.viewOnly ? 0 : 1, e: m.viewOnly ? 0 : 1, d: 0, ap: m.ap ? 1 : 0 }])) },
  staff: { n: 'موظف / عضو', p: () => ({ req: { v: 1, a: 1, e: 0, d: 0, ap: 0 }, task: { v: 1, a: 0, e: 0, d: 0 }, kpi: { v: 1, a: 0, e: 0, d: 0 }, rep: { v: 0 } }) },
  view: { n: 'اطلاع فقط', p: () => Object.fromEntries(MODS.map(m => [m.k, { v: m.k === 'rep' ? 0 : 1, a: 0, e: 0, d: 0, ap: 0 }])) }
};
const COL = { req: 's_req', task: 's_task', kpi: 's_kpi' };
export const FLOW = ['تقديم الطلب', 'عند رئيس القسم', 'عند العميد', 'معتمد'];
export const PENDING = ['عند رئيس القسم', 'عند العميد'];
const ADMIN_ID = 'khaled';
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clean = (s, n = 400) => String(s ?? '').slice(0, n);
export const can = (u, mod, p) => !!(u && u.active !== false && (u.admin || u.perms?.[mod]?.[p]));
const pub = u => u && ({ id: u.id, name: u.name, title: u.title || '', email: u.email || '', admin: !!u.admin, active: u.active !== false, perms: u.perms || {}, preset: u.preset || '' });

const FIELDS = {
  req: ['title', 'type', 'applicant', 'details', 'status', 'due', 'priority', 'note'],
  task: ['title', 'owner', 'due', 'status', 'priority', 'details', 'progress'],
  kpi: ['name', 'target', 'actual', 'unit', 'period', 'better', 'owner']
};

async function notify(store, to, text, mod, ref) {
  for (const t of [...new Set(to)].filter(Boolean)) {
    const id = rid(); await store.writeDoc('s_notif', id, { id, to: t, text: clean(text, 200), mod, ref, at: Date.now(), read: false });
  }
}
async function log(store, by, act, mod, ref, title) { const id = rid(); await store.writeDoc('s_log', id, { id, by, act, mod, ref, title: clean(title, 120), at: Date.now() }); }

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
    const id = clean(b.user, 60).trim().toLowerCase();
    let u = await store.readOne('s_users', id);
    if (!u) { const all = await store.readCol('s_users'); u = all.find(x => (x.email || '').toLowerCase() === id) || null; }
    if (!u && id === ADMIN_ID) u = await ensureAdmin(store, hp, hp.adminPw);
    if (!u || u.active === false) return { status: 401, body: { error: 'bad' } };
    const rec = await store.readOne('_s_auth', u.id);
    if (!rec || !(await hp.check(String(b.pass || ''), rec))) return { status: 401, body: { error: 'bad' } };
    await log(store, u.id, 'login', 'sys', '', 'تسجيل دخول');
    return { status: 200, body: { ok: true, id: u.id, mustChange: !!rec.temp }, session: u.id };
  }
  if (act === 'logout') return { status: 200, body: { ok: true }, session: null };
  const me = sessId ? await store.readOne('s_users', sessId) : null;
  if (!me || me.active === false) return { status: 401, body: { error: 'auth' } };

  if (act === 'boot') {
    const out = { me: pub(me), mods: MODS, presets: Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.n])) };
    for (const [m, c] of Object.entries(COL)) if (can(me, m, 'v') || (m === 'task')) {
      let docs = await store.readCol(c);
      if (!can(me, m, 'v')) docs = docs.filter(d => d.owner === me.id); // tasks assigned to me are always visible
      out[m] = docs;
    }
    const users = await store.readCol('s_users');
    out.people = users.filter(u => u.active !== false).map(u => ({ id: u.id, name: u.name, title: u.title || '' }));
    if (me.admin) out.users = users.map(pub);
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
    for (const f of FIELDS[m]) if (f in d) doc[f] = clean(d[f], f === 'body' || f === 'details' ? 4000 : 300);
    // approval changes need approval permission
    if (m === 'req' && old && d.status && d.status !== old.status && !can(me, 'req', 'ap') && !(isOwnReturned && d.status === 'عند رئيس القسم')) return { status: 403, body: { error: 'forbidden' } };
    if (m === 'req' && isOwnReturned && !can(me, 'req', 'e') && !can(me, 'req', 'ap')) doc.status = 'عند رئيس القسم';
    if (isOwnTask && !can(me, m, 'e')) { for (const f of FIELDS.task) if (!['status', 'progress'].includes(f)) doc[f] = old[f]; }
    if (!old) { doc.by = me.id; doc.at = Date.now(); if (m === 'req') doc.status = 'عند رئيس القسم'; if (m === 'task' && !doc.status) doc.status = 'لم تبدأ'; }
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
    await store.writeDoc('_s_auth', me.id, { id: me.id, ...(await hp.hash(b.pass)) }); return { status: 200, body: { ok: true } };
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
  if (act === 'seed') { await seed(store, me.id); await log(store, me.id, 'add', 'sys', '', 'تحميل بيانات تجريبية'); return { status: 200, body: { ok: true } }; }
  if (act === 'wipe') {
    for (const c of [...Object.values(COL), 's_dec']) for (const d of await store.readCol(c)) await store.writeDoc(c, d.id, null);
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
  for (const [name, target, actual, unit, better] of K) await W('s_kpi', { name, target: String(target), actual: String(actual), unit, better, period: 'الفصل الأول 1448' });
}
