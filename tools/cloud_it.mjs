// 真实 Supabase 项目上的集成测试（Baby / wzfbdvlmkoeftvtnmiex）：
// A 建家庭+宝宝+记录 → 邀请 B → B 加入看到 A 的记录 → B 新记录通过 Realtime 推给 A → C 读不到（RLS）。
// 账号与密码来自 .env.test（不进 git）；测试数据最后由 A/B/C 自己删除（注销账号 RPC 在另一个测试里验证）。
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const cfg = fs.readFileSync(new URL('../src/data/cloud-config.ts', import.meta.url), 'utf8');
const app = { supabaseUrl: cfg.match(/'(https:[^']+)'/)[1], supabasePublishableKey: cfg.match(/'(sb_publishable_[^']+)'/)[1] };
const env = Object.fromEntries(fs.readFileSync(new URL('../.env.test', import.meta.url), 'utf8').split('\n').filter(Boolean).map(l => l.split('=')));
const mk = () => createClient(app.supabaseUrl, app.supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
let pass = 0, fail = 0;
const check = (name, ok, info = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const A = mk(), B = mk(), C = mk(), anon = mk();
for (const [c, e] of [[A, env.YJ_IT_A], [B, env.YJ_IT_B], [C, env.YJ_IT_C]]) {
  const { error } = await c.auth.signInWithPassword({ email: e, password: env.YJ_IT_PASSWORD });
  check(`sign in ${e}`, !error, error?.message);
}
const uidA = (await A.auth.getUser()).data.user.id;
const tag = 'it' + Date.now().toString(36);

// A：建家庭 + 宝宝 + 记录
const { data: fam, error: e1 } = await A.rpc('create_family', { p_name: '测试之家', p_display_name: '妈妈' });
check('A create_family', !e1 && !!fam, e1?.message);
const babyId = tag + '-baby';
const { error: e2 } = await A.from('babies').insert({ id: babyId, family_id: fam, name: '豆米', birthday: '2026-03-28', gender: 'girl', avatar: 'baby', feeding: 'formula' });
check('A insert baby', !e2, e2?.message);
const recA = { id: tag + '-a1', baby_id: babyId, family_id: fam, type: 'feed', started_at: new Date().toISOString(), vals: { sub: 'formula', ml: 150 }, created_by_name: '冒充奶奶', src: 'manual' };
const { data: insA, error: e3 } = await A.from('records').insert(recA).select().single();
check('A insert record', !e3, e3?.message);
check('created_by forced to A + family display name', insA?.created_by === uidA && insA?.created_by_name === '妈妈', `${insA?.created_by_name}`);

// C（不是成员）读不到 / 写不进
const { data: cRead } = await C.from('records').select('id').eq('baby_id', babyId);
check('RLS: C cannot read family records', (cRead ?? []).length === 0, JSON.stringify(cRead));
const { data: cBaby } = await C.from('babies').select('id').eq('id', babyId);
check('RLS: C cannot read baby', (cBaby ?? []).length === 0);
const { data: cFam } = await C.from('families').select('id').eq('id', fam);
check('RLS: C cannot read family', (cFam ?? []).length === 0);
const { error: cIns } = await C.from('records').insert({ ...recA, id: tag + '-c1' });
check('RLS: C cannot insert into family', !!cIns, cIns?.message);
const { data: cUpd } = await C.from('records').update({ note: 'hack' }).eq('id', recA.id).select();
check('RLS: C cannot update family record', (cUpd ?? []).length === 0);
const { error: cInv } = await C.rpc('create_invite', { p_family: fam });
check('C cannot create invite for family', !!cInv, cInv?.message);
const { data: anonRead, error: anonErr } = await anon.from('records').select('id');
check('anon cannot read records', !!anonErr || (anonRead ?? []).length === 0, anonErr?.message);

// 邀请 B
const { data: inv, error: e4 } = await A.rpc('create_invite', { p_family: fam });
const code = inv?.[0]?.code;
check('A create_invite → 6-char code + expiry', !e4 && /^[A-Z0-9]{6}$/.test(code ?? '') && new Date(inv[0].expires_at) > new Date(), `${code} ${inv?.[0]?.expires_at}`);
const { data: bad } = await B.rpc('accept_invite', { p_code: 'ZZZZZZ', p_display_name: '爸爸' });
check('wrong code rejected', bad === null);
const { data: joined, error: e5 } = await B.rpc('accept_invite', { p_code: code.toLowerCase(), p_display_name: '爸爸' });
check('B accept_invite (case-insensitive)', !e5 && joined === fam, e5?.message);
const { data: reuse } = await C.rpc('accept_invite', { p_code: code, p_display_name: '外人' });
check('used code cannot be reused by C', reuse === null);
const { data: bSees } = await B.from('records').select('id, created_by_name').eq('baby_id', babyId);
check('B sees A\'s record', (bSees ?? []).some(r => r.id === recA.id && r.created_by_name === '妈妈'));
const { data: mem } = await B.from('family_members').select('display_name, role').eq('family_id', fam).order('joined_at');
check('members visible to B: 妈妈(admin) + 爸爸(member)', JSON.stringify(mem) === JSON.stringify([{ display_name: '妈妈', role: 'admin' }, { display_name: '爸爸', role: 'member' }]), JSON.stringify(mem));
const { error: selfAdmin } = await B.from('family_members').update({ role: 'admin' }).eq('family_id', fam).eq('user_id', (await B.auth.getUser()).data.user.id);
check('B cannot promote self to admin', !!selfAdmin, selfAdmin?.message);

// Realtime：A 订阅本宝宝记录，B 新增 → A 几秒内收到
const got = [];
const ch = A.channel('it-' + tag).on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `baby_id=eq.${babyId}` }, p => got.push({ t: Date.now(), p }));
await new Promise(res => ch.subscribe(s => { if (s === 'SUBSCRIBED') res(); }));
await sleep(2500); // postgres_changes 订阅在 SUBSCRIBED 后还需片刻才生效
const t0 = Date.now();
const recB = { id: tag + '-b1', baby_id: babyId, family_id: fam, type: 'diaper', started_at: new Date().toISOString(), vals: { sub: 'both' }, src: 'manual' };
const { error: e6 } = await B.from('records').insert(recB);
check('B insert record', !e6, e6?.message);
for (let i = 0; i < 100 && !got.some(g => g.p.new?.id === recB.id); i++) await sleep(100);
const hit = got.find(g => g.p.new?.id === recB.id);
check('A receives B\'s record via realtime', !!hit, hit ? `${hit.t - t0} ms, by ${hit.p.new.created_by_name}` : 'timeout');
// C 订阅同一宝宝：收不到（Realtime 也受 RLS）
const gotC = [];
const chC = C.channel('itc-' + tag).on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `baby_id=eq.${babyId}` }, p => gotC.push(p));
await new Promise(res => chC.subscribe(s => { if (s === 'SUBSCRIBED') res(); }));
await sleep(800);
await B.from('records').update({ note: 'B 改了', deleted_at: new Date().toISOString() }).eq('id', recB.id);
for (let i = 0; i < 30 && !got.some(g => g.p.new?.id === recB.id && g.p.new?.deleted_at); i++) await sleep(100);
check('A receives soft-delete via realtime', got.some(g => g.p.new?.id === recB.id && g.p.new?.deleted_at));
await sleep(1500);
check('RLS: C receives nothing via realtime', gotC.length === 0, `${gotC.length} events`);
await A.removeChannel(ch); await C.removeChannel(chC);

// 清理：B 退出家庭、A 删除家庭（管理员）—— 用 delete_account 之外的普通权限
const { error: eLeave } = await B.from('family_members').delete().eq('family_id', fam).eq('user_id', (await B.auth.getUser()).data.user.id);
check('B can leave family', !eLeave, eLeave?.message);
const { data: bAfter } = await B.from('records').select('id').eq('baby_id', babyId);
check('after leaving, B cannot read', (bAfter ?? []).length === 0);
const { error: eDel } = await A.rpc('delete_account');
check('A delete_account (sole member → family, baby, records deleted)', !eDel, eDel?.message);
const { data: aAfter, error: aAfterErr } = await A.from('records').select('id');
check('A\'s old token sees nothing afterwards', !!aAfterErr || (aAfter ?? []).length === 0);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
