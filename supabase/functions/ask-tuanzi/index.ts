/* Edge Function：ask-tuanzi —— 「问团子」。
   顺序写死（docs/M5-ASK-AGENT.md §3.1）：
     1) 校验 JWT + 用用户 JWT 查 babies（RLS 保证只看自家）→ 查不到 = 403
     2) 取最近一次体温，服务端再跑一遍规则分档；紧急 → 直接返回 tier=urgent，**不计次**
     3) 计数 bump_ai_usage(kind='ask')，超过每日上限 → 429
     4) qwen-flash 分类 + agent 循环（tools 只读，用户 JWT）
     5) 回答检查 / 改写 / 兜底，最后拼成响应
   key 只从 Supabase secrets 读（DASHSCOPE_API_KEY）；日志不记问题原文、不记回答、不记记录内容。 */
import { ruleTier } from '../_shared/ask-core.ts';
import type { RecordRow as CoreRow } from '../_shared/ask-stats.ts';
import { answerQuestion, type DataSource, type Baby, type HealthRaw } from '../_shared/ask-agent.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (status: number, code: string, message: string) => json(status, { ok: false, code, message });

type Row = { type: string; started_at: string; ended_at: string | null; vals: Record<string, unknown>; note: string | null; created_by_name: string };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method', 'POST only');

  const auth = req.headers.get('authorization') ?? '';
  if (!/^Bearer\s+\S+$/.test(auth)) return fail(401, 'auth', '请先登录');
  const SB = Deno.env.get('SUPABASE_URL');
  const anon = req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '';
  const KEY = Deno.env.get('DASHSCOPE_API_KEY');
  const limit = Math.max(1, Number(Deno.env.get('ASK_DAILY_LIMIT') ?? 20) || 20);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, 'bad_request', '请求格式不对'); }

  const babyId = typeof body.babyId === 'string' && body.babyId.length >= 4 && body.babyId.length <= 64 ? body.babyId : null;
  if (!babyId) return fail(400, 'bad_request', '请求格式不对');
  const question = (typeof body.question === 'string' ? body.question : '').trim().slice(0, 200);
  if (!question) return fail(400, 'empty', '想问什么呀？');
  const tz = Math.max(-840, Math.min(840, Number(body.tzOffsetMin) || 0));
  const history = Array.isArray(body.history)
    ? (body.history as { q?: string; a?: string }[]).filter(h => h && typeof h.q === 'string').slice(-3)
      .map(h => ({ q: String(h.q).slice(0, 300), a: String(h.a ?? '').slice(0, 300) }))
    : [];
  const nowMs = Date.now();

  const h = { apikey: anon, Authorization: auth, 'Content-Type': 'application/json' };
  const rest = async <T,>(path: string): Promise<T> => {
    const r = await fetch(`${SB}/rest/v1/${path}`, { headers: h });
    if (r.status === 401) throw Object.assign(new Error('auth'), { status: 401 });
    if (!r.ok) throw Object.assign(new Error('db'), { status: 502 });
    return await r.json() as T;
  };

  /* 1) 家庭成员校验：用用户 JWT 查 babies，RLS 保证只返回自家的 */
  let babyRow: { id: string; name: string; birthday: string; gender: 'girl' | 'boy'; feeding: 'formula' | 'bm' | 'breast' } | undefined;
  try {
    const rows = await rest<typeof babyRow[]>(`babies?id=eq.${encodeURIComponent(babyId)}&deleted_at=is.null&select=id,name,birthday,gender,feeding`);
    babyRow = rows[0];
  } catch (e) {
    const s = (e as { status?: number }).status;
    return s === 401 ? fail(401, 'auth', '登录已过期，请重新登录') : fail(502, 'db', '暂时连不上，请稍后再试');
  }
  if (!babyRow) return fail(403, 'not_member', '你还不是这个宝宝的家庭成员');
  if (!KEY) return fail(503, 'not_configured', '问团子还没配置好，过几天再来试试');

  /* 2) 服务端规则再判一次（防旧版 App / 绕过）；紧急不计次 */
  const since = new Date(nowMs - 12 * 3600000).toISOString();
  let latestTemp: { v: number; at: number } | undefined;
  try {
    const temps = await rest<{ vals: { v?: number }; started_at: string }[]>(
      `records?baby_id=eq.${encodeURIComponent(babyId)}&deleted_at=is.null&type=eq.temp&started_at=gte.${since}&select=vals,started_at&order=started_at.desc&limit=1`,
    );
    if (temps[0]?.vals?.v != null) latestTemp = { v: Number(temps[0].vals.v), at: Date.parse(temps[0].started_at) };
  } catch { /* 查不到体温不影响规则主干 */ }

  const ageDays = Math.max(0, Math.floor((nowMs - Date.parse(`${babyRow.birthday}T00:00:00${tzOffsetStr(tz)}`)) / 86400000));
  const rule = ruleTier(question, { ageDays, nowMs, ...(latestTemp ? { latestTemp } : {}) });
  if (rule.tier === 'urgent') {
    log({ tier: 'urgent', rule: rule.reasons.join(','), rounds: 0, tools: 0, ms: 0, used: null });
    return json(200, { ok: true, tier: 'urgent', urgent: { reasons: rule.reasons }, answer: null, usage: null, meta: { rounds: 0, tools: 0, rewritten: false, fallback: false, ms: 0 } });
  }

  /* 3) 每户每日次数（北京时间自然日） */
  let used: number;
  try {
    const q = await fetch(`${SB}/rest/v1/rpc/bump_ai_usage`, { method: 'POST', headers: h, body: JSON.stringify({ p_baby: babyId, p_kind: 'ask' }) });
    if (q.status === 401) return fail(401, 'auth', '登录已过期，请重新登录');
    if (!q.ok) return fail(502, 'db', '暂时连不上，请稍后再试');
    used = Number(await q.json()) || 0;
  } catch { return fail(502, 'db', '暂时连不上，请稍后再试'); }
  if (used > limit) return fail(429, 'quota', '今天问得有点多啦，明天再聊');

  /* 4) 数据源：全部用用户 JWT 读，RLS 保证只看自家 */
  const ds: DataSource = {
    async baby(): Promise<Baby> {
      return { name: babyRow!.name, birthday: babyRow!.birthday, gender: babyRow!.gender, feeding: babyRow!.feeding };
    },
    async records(fromIso: string, toIso: string): Promise<CoreRow[]> {
      const rows = await rest<Row[]>(
        `records?baby_id=eq.${encodeURIComponent(babyId!)}&deleted_at=is.null&started_at=gte.${fromIso}&started_at=lte.${toIso}` +
        '&select=type,started_at,ended_at,vals,note,created_by_name&order=started_at.asc&limit=1500',
      );
      return rows;
    },
    async health(): Promise<HealthRaw> {
      const [allergies, episodes, vaccines, reminders] = await Promise.all([
        rest<{ name: string }[]>(`allergies?baby_id=eq.${encodeURIComponent(babyId!)}&deleted_at=is.null&select=name`),
        rest<{ title: string; start_date: string; end_date: string | null; status: 'active' | 'recovered' }[]>(`episodes?baby_id=eq.${encodeURIComponent(babyId!)}&deleted_at=is.null&select=title,start_date,end_date,status`),
        rest<{ name: string; given_on: string }[]>(`vaccines?baby_id=eq.${encodeURIComponent(babyId!)}&deleted_at=is.null&select=name,given_on&order=given_on.asc`),
        rest<{ cat: string; title: string; due_at: string; repeat: string; done_at: string | null }[]>(`reminders?baby_id=eq.${encodeURIComponent(babyId!)}&deleted_at=is.null&select=cat,title,due_at,repeat,done_at`),
      ]);
      return { allergies, episodes, vaccines, reminders };
    },
  };

  /* 5) 分类 + agent + 检查 */
  const t0 = Date.now();
  try {
    const r = await answerQuestion({
      key: KEY, ds, question, tz, nowMs, ageDays,
      ageText: ageTextOf(babyRow.birthday, nowMs, tz),
      history, tierRule: rule.tier, ...(latestTemp ? { latestTemp } : {}),
    });
    log({
      tier: r.tier, rule: rule.tier, rounds: r.meta.rounds, tools: r.meta.tools,
      rewritten: r.meta.rewritten, fallback: r.meta.fallback, ms: Date.now() - t0, used,
    });
    return json(200, {
      ok: true, tier: r.tier, ...(r.urgent ? { urgent: r.urgent } : {}),
      answer: r.answer, usage: { used, limit },
      meta: { rounds: r.meta.rounds, tools: r.meta.tools, rewritten: r.meta.rewritten, fallback: r.meta.fallback, ms: Date.now() - t0 },
    });
  } catch (e) {
    const msg = (e as Error).message || '';
    log({ tier: 'error', rule: rule.tier, err: msg.slice(0, 60), ms: Date.now() - t0, used });
    if (/abort|timeout/i.test(msg)) return fail(504, 'timeout', '团团想得有点久，再问一次试试');
    if (/llm_http_(401|403)/.test(msg) || /Arrearage/i.test(msg)) return fail(503, 'not_configured', '问团子还没配置好，过几天再来试试');
    return fail(502, 'llm_failed', '团团这会儿有点忙，过一会儿再问我吧');
  }
});

/** tzOffsetMin = new Date().getTimezoneOffset()（北京 -480）；用来拼生日当天的偏移 */
function tzOffsetStr(tz: number) {
  const sign = tz <= 0 ? '+' : '-';
  const abs = Math.abs(tz);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

function ageTextOf(birthday: string, nowMs: number, tz: number) {
  const b = Date.parse(`${birthday}T00:00:00${tzOffsetStr(tz)}`);
  const days = Math.max(0, Math.floor((nowMs - b) / 86400000));
  const months = Math.floor(days / 30.4375);
  return months ? `${months} 个月 ${Math.max(0, days - Math.round(months * 30.4375))} 天` : `${days} 天`;
}

/** 一行 JSON 日志：不记问题原文、不记回答、不记记录内容、不记 key */
function log(o: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: 'ask-tuanzi', ...o }));
}
