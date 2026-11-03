/* Edge Function：delete-account —— 注销账号（「我的 › 注销账号」两步确认之后调用）。
   接口约定（前端 src/data/sync.ts → cloud.deleteAccount）：
     POST {SUPABASE_URL}/functions/v1/delete-account
     Authorization: Bearer <用户 JWT>   body: {"confirm":"DELETE"}
     200 {"ok":true}                     已删除：前端 signOut + 清空本机数据 → 欢迎页
     401 {"ok":false,"code":"auth"}      没带 / 无效 / 过期的登录
     400 {"ok":false,"code":"confirm"}   body 不是 {"confirm":"DELETE"}
     500 {"ok":false,"code":"server"}    服务端出错（前端提示「注销没成功，请稍后再试」，不登出）
   顺序：
     1) 用用户 JWT 调 /auth/v1/user 拿到 uid（无效 → 401）
     2) 用用户 JWT 调 rpc delete_account_data()（security definer，只能删 auth.uid() 自己）：
        只有自己的家庭整体删除（宝宝 / 记录 / 健康档案 / 邀请码随外键级联）；
        还有家人的家庭只退出，若自己是唯一管理员则把最早加入的家人升为管理员；删 profiles
     3) service role 调 auth.admin 删除用户（DELETE /auth/v1/admin/users/<uid>），会话随之失效
   第 2 步可重复执行；第 3 步失败时返回 500，用户重试即可（数据已删，账号还在，再调一次会删掉账号）。
   日志只记标签和计数，不记邮箱、uid、家庭名、宝宝名。
   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 由平台自动注入，不需要另配 secret。 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (status: number, code: string, message: string) => json(status, { ok: false, code, message });
const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ fn: 'delete-account', ...o }));

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method', 'POST only');

  const auth = req.headers.get('authorization') ?? '';
  if (!/^Bearer\s+\S+$/.test(auth)) { log({ step: 'auth', ok: false }); return fail(401, 'auth', '请先登录'); }
  const SB = Deno.env.get('SUPABASE_URL');
  const anon = req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SB || !service) { log({ step: 'config', ok: false }); return fail(500, 'server', '注销没成功，请稍后再试'); }

  /* 1) 校验登录：拿 uid */
  let uid: string;
  try {
    const r = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
    if (r.status === 401 || r.status === 403) { log({ step: 'auth', ok: false }); return fail(401, 'auth', '登录已过期，请重新登录'); }
    if (!r.ok) { log({ step: 'auth', ok: false, status: r.status }); return fail(500, 'server', '注销没成功，请稍后再试'); }
    const u = await r.json() as { id?: string };
    if (!u?.id) { log({ step: 'auth', ok: false }); return fail(401, 'auth', '登录已过期，请重新登录'); }
    uid = u.id;
  } catch { log({ step: 'auth', ok: false, net: true }); return fail(500, 'server', '注销没成功，请稍后再试'); }

  /* 校验确认字：防止误调用 */
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* 空 body 当作没确认 */ }
  if (body?.confirm !== 'DELETE') { log({ step: 'confirm', ok: false }); return fail(400, 'confirm', '请先确认注销'); }

  /* 2) 删数据（用户 JWT，函数里只认 auth.uid()） */
  let counts: Record<string, number> = {};
  try {
    const r = await fetch(`${SB}/rest/v1/rpc/delete_account_data`, {
      method: 'POST', headers: { apikey: anon, Authorization: auth, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (r.status === 401) { log({ step: 'data', ok: false, status: 401 }); return fail(401, 'auth', '登录已过期，请重新登录'); }
    if (!r.ok) { log({ step: 'data', ok: false, status: r.status }); return fail(500, 'server', '注销没成功，请稍后再试'); }
    counts = (await r.json()) as Record<string, number>;
  } catch { log({ step: 'data', ok: false, net: true }); return fail(500, 'server', '注销没成功，请稍后再试'); }

  /* 3) 删账号（service role，只在服务端） */
  try {
    const r = await fetch(`${SB}/auth/v1/admin/users/${encodeURIComponent(uid)}`, {
      method: 'DELETE', headers: { apikey: service, Authorization: `Bearer ${service}` },
    });
    if (!r.ok && r.status !== 404) { log({ step: 'user', ok: false, status: r.status, ...counts }); return fail(500, 'server', '注销没成功，请稍后再试'); }
  } catch { log({ step: 'user', ok: false, net: true, ...counts }); return fail(500, 'server', '注销没成功，请稍后再试'); }

  log({ step: 'done', ok: true, families_deleted: counts.families_deleted ?? 0, families_left: counts.families_left ?? 0, admins_promoted: counts.admins_promoted ?? 0 });
  return json(200, { ok: true });
});
