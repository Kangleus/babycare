/* 离线验证 supabase/migrations：在 PGlite（WASM 版 Postgres，不连任何线上库）里按顺序跑全部 migration，
   再用 authenticated 角色测 create_family_with_baby / delete_account_data 的校验、事务和权限。
   用法（PGlite 不是项目依赖，装在临时目录）：
     mkdir -p /tmp/pgl && cd /tmp/pgl && npm i @electric-sql/pglite && node <repo>/tools/sql/test_migrations.mjs
   auth schema 用最小桩：auth.users + auth.uid() 读 request.jwt.claim.sub。 */
import { createRequire } from 'module';
const require = createRequire(process.cwd() + '/');
const { PGlite } = require('@electric-sql/pglite');
import fs from 'fs';
const db = new PGlite();
const M = new URL('../../supabase/migrations/', import.meta.url).pathname;
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;
create publication supabase_realtime;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);
for (const f of fs.readdirSync(M).sort()) { await db.exec(fs.readFileSync(M + f, 'utf8')); console.log('applied', f); }
const U = ['11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333'];
for (const u of U) await db.query('insert into auth.users(id) values ($1)', [u]);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
async function as(uid, sql, params = []) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec(uid ? 'set role authenticated' : 'set role anon');
  try { const r = await db.query(sql, params); return { rows: r.rows }; }
  catch (e) { return { err: e.message, code: e.code }; }
  finally { await db.exec('reset role'); }
}
const baby = (o = {}) => JSON.stringify({ id: 'b-' + Math.random().toString(36).slice(2, 8), name: '糯米', birthday: '2026-09-12', gender: 'boy', avatar: 'sprout', feeding: 'bm', ...o });
const CF = 'select * from public.create_family_with_baby($1, $2, $3::jsonb)';

let r = await as(null, CF, ['我们家', '妈妈', baby()]);
ok(r.err && /permission denied/.test(r.err), 'anon cannot call create_family_with_baby: ' + r.err);
r = await as(U[0], CF, ['我们家', '妈妈', baby({ id: 'baby-a1' })]);
ok(r.rows && r.rows[0].baby_id === 'baby-a1' && r.rows[0].family_id, 'create ok ' + JSON.stringify(r.rows ?? r.err));
const famA = r.rows[0].family_id;
r = await as(U[0], 'select name, family_id from public.babies');
ok(r.rows?.length === 1 && r.rows[0].family_id === famA, 'creator sees baby via RLS');
r = await as(U[0], 'select role, display_name from public.family_members');
ok(r.rows?.[0]?.role === 'admin' && r.rows[0].display_name === '妈妈', 'creator is admin');
for (const [o, label] of [
  [{ name: '' }, 'empty name'], [{ name: '一二三四五六七八九十一二三' }, '13-char name'], [{ birthday: '2099-01-01' }, 'future birthday'],
  [{ birthday: '2026-02-30' }, 'invalid date'], [{ birthday: 'abc' }, 'bad format'], [{ gender: 'x' }, 'bad gender'],
  [{ avatar: 'dog' }, 'bad avatar'], [{ feeding: 'milk' }, 'bad feeding'], [{ id: 'abc' }, 'short id'], [{ id: 'x'.repeat(65) }, 'long id'],
]) {
  r = await as(U[1], CF, ['我们家', '爸爸', baby(o)]);
  ok(r.code === '22023', `reject ${label}: ${r.code} ${r.err}`);
}
r = await as(U[1], 'select count(*)::int n from public.family_members');
ok(r.rows[0].n === 0, 'rejections left no partial family (atomic)');
r = await as(U[1], CF, ['我们家', '爸爸', '"str"']);
ok(r.code === '22023', 'reject non-object baby');
r = await as(U[1], CF, ['我们家', '一二三四五六七八九十一二三', baby()]);
ok(r.code === '22023', 'reject 13-char display name');
// duplicate baby id → error, nothing left behind
r = await as(U[1], CF, ['我们家', '爸爸', baby({ id: 'baby-a1' })]);
ok(!!r.err, 'duplicate baby id rejected: ' + r.code);
r = await as(U[1], 'select count(*)::int n from public.families');
ok(r.rows[0].n === 0, 'duplicate id rolled back family');
// ≤5 families
for (let i = 0; i < 4; i++) await as(U[0], CF, ['我们家', '妈妈', baby()]);
r = await as(U[0], CF, ['我们家', '妈妈', baby()]);
ok(r.code === '54000', '6th family rejected 54000');
// today ok
r = await as(U[2], CF, ['', '', baby({ birthday: new Date().toISOString().slice(0, 10) })]);
ok(!r.err, 'birthday today accepted, blank name/display default: ' + (r.err ?? ''));
r = await as(U[2], 'select f.name, m.display_name from public.families f join public.family_members m on m.family_id=f.id');
ok(r.rows?.[0]?.name === '我们家' && r.rows[0].display_name === '妈妈', 'defaults 我们家/妈妈');

// ---------- delete_account_data ----------
await db.exec('reset role');
// U1 joins famA as member (invite flow)
await db.query(`insert into public.family_members(family_id,user_id,role,display_name,joined_at) values ($1,$2,'member','爸爸', now()+interval '1 minute')`, [famA, U[1]]);
await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [U[0]]);
await db.exec('set role authenticated');
await db.query(`insert into public.records(id,baby_id,family_id,type,started_at) values ('rec-0001','baby-a1',$1,'feed',now())`, [famA]);
await db.exec('reset role');
r = await as(null, 'select public.delete_account_data()');
ok(r.err && /permission denied/.test(r.err), 'anon cannot call delete_account_data');
r = await as(U[0], 'select public.delete_account_data() d');
ok(r.rows?.[0]?.d?.families_deleted === 4 && r.rows[0].d.families_left === 1 && r.rows[0].d.admins_promoted === 1, 'U0 delete counts ' + JSON.stringify(r.rows?.[0]?.d ?? r.err));
await db.exec('reset role');
r = await db.query('select user_id, role from public.family_members where family_id=$1', [famA]);
ok(r.rows.length === 1 && r.rows[0].user_id === U[1] && r.rows[0].role === 'admin', 'remaining member promoted to admin');
r = await db.query(`select count(*)::int n from public.records where family_id=$1`, [famA]);
ok(r.rows[0].n === 1, 'shared family records kept');
r = await db.query(`select count(*)::int n from public.families where created_by=$1`, [U[0]]);
ok(r.rows[0].n === 1, 'only shared family remains of U0 created ones');
r = await db.query(`select count(*)::int n from public.profiles where id=$1`, [U[0]]);
ok(r.rows[0].n === 0, 'profile deleted');
r = await as(U[0], 'select public.delete_account_data() d');
ok(r.rows?.[0]?.d?.families_deleted === 0, 'idempotent second call');
r = await as(U[2], 'select public.delete_account_data() d');
await db.exec('reset role');
const n = await db.query(`select (select count(*)::int from public.babies) b, (select count(*)::int from public.families) f`);
ok(n.rows[0].f === 1 && n.rows[0].b === 1, 'solo family + baby cascaded: ' + JSON.stringify(n.rows[0]));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
