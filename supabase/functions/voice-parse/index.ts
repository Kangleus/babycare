/* Edge Function：voice-parse —— 一句话（录音或文字）→ 文字 → 结构化记录草稿。
   1) 网关先校验 JWT（verify_jwt = true）；这里再用「用户自己的 JWT」查宝宝（RLS 保证只能看到自家），查不到 = 不是家庭成员
   2) 每户每日次数上限：private.bump_ai_usage（按北京时间自然日计数）
   3) 百炼 key 只从 Supabase secrets 读（DASHSCOPE_API_KEY），不回传、不打印；音频识别完即丢，不落库
   返回的只是草稿，App 弹确认卡，家长点「记下来」后才写 records。 */
import { hotwordContext, type Ctx, type RecentRec, type VType, VTYPES } from '../_shared/voice-core.ts';
import { llmParse, transcribe, type AudioFmt } from '../_shared/dashscope.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const FORMATS: AudioFmt[] = ['wav', 'pcm', 'aac', 'mp3', 'opus', 'amr'];
const MAX_B64 = 2_800_000; // ≈ 2MB 音频（16k 单声道 wav 约 60 秒）
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (status: number, code: string, message: string) => json(status, { ok: false, code, message });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail(405, 'method', 'POST only');
  const auth = req.headers.get('authorization') ?? '';
  if (!/^Bearer\s+\S+$/.test(auth)) return fail(401, 'auth', '请先登录');
  const SB = Deno.env.get('SUPABASE_URL');
  const anon = req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '';
  const KEY = Deno.env.get('DASHSCOPE_API_KEY');
  const limit = Math.max(1, Number(Deno.env.get('VOICE_DAILY_LIMIT') ?? 60) || 60);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, 'bad_request', '请求格式不对'); }
  const babyId = typeof body.babyId === 'string' && body.babyId.length >= 4 && body.babyId.length <= 64 ? body.babyId : null;
  if (!babyId) return fail(400, 'bad_request', '缺少宝宝');
  const text0 = typeof body.text === 'string' ? body.text.trim().slice(0, 200) : '';
  const a = body.audio as { b64?: unknown; format?: unknown; rate?: unknown } | undefined;
  const audio = a && typeof a.b64 === 'string' && a.b64.length > 100 && a.b64.length <= MAX_B64 && FORMATS.includes(a.format as AudioFmt)
    ? { b64: a.b64, format: a.format as AudioFmt, rate: Math.min(48000, Math.max(8000, Number(a.rate) || 16000)) } : null;
  if (a && !audio) return fail(400, 'bad_audio', '录音太长或格式不支持');
  if (!audio && !text0) return fail(400, 'empty', '没有听到内容');

  /* 1. 宝宝 + 家庭成员校验（用户 JWT + RLS） */
  const h = { apikey: anon, Authorization: auth, 'Content-Type': 'application/json' };
  const br = await fetch(`${SB}/rest/v1/babies?id=eq.${encodeURIComponent(babyId)}&deleted_at=is.null&select=name,feeding`, { headers: h });
  if (br.status === 401) return fail(401, 'auth', '登录已过期，请重新登录');
  if (!br.ok) return fail(502, 'db', '暂时连不上，请稍后再试');
  const babies = await br.json() as { name: string; feeding: 'formula' | 'bm' | 'breast' }[];
  if (!babies.length) return fail(403, 'not_member', '你还不是这个宝宝的家庭成员');
  if (!KEY) return fail(503, 'not_configured', 'AI 语音还没配置好，先打字或手动记一笔');

  /* 2. 每户每日上限 */
  const q = await fetch(`${SB}/rest/v1/rpc/bump_ai_usage`, { method: 'POST', headers: h, body: JSON.stringify({ p_baby: babyId, p_kind: 'voice' }) });
  if (!q.ok) return fail(q.status === 401 ? 401 : 502, q.status === 401 ? 'auth' : 'db', '暂时连不上，请稍后再试');
  const used = Number(await q.json()) || 0;
  if (used > limit) return fail(429, 'quota', `今天的语音次数用完啦（${limit} 次），手动记一笔也很快`);

  /* 3. 语音 → 文字 */
  const ctx: Ctx = {
    nowMs: Date.now(),
    tzOffsetMin: Math.max(-840, Math.min(840, Number(body.tzOffsetMin) || 0)),
    babyName: babies[0].name, feeding: babies[0].feeding,
    recent: Array.isArray(body.recent) ? (body.recent as RecentRec[]).filter(r => r && VTYPES.includes(r.type as VType) && typeof r.time === 'string').slice(0, 5) : [],
  };
  let text = text0, engine = 'text';
  const t0 = Date.now();
  if (audio) {
    try { const r = await transcribe(KEY, audio, hotwordContext(ctx.babyName)); text = r.text.slice(0, 200); engine = r.engine; }
    catch (e) { console.log('asr error', (e as Error).message); return fail(502, 'asr_failed', '团团没听清，再说一次或打字试试'); }
    if (!text.replace(/[。，,.\s]/g, '')) return fail(422, 'no_speech', '团团没听清，再说一次或打字试试');
  }
  const t1 = Date.now();
  /* 4. 文字 → 结构化草稿 */
  const parse = await llmParse(KEY, text, ctx);
  console.log(JSON.stringify({ fn: 'voice-parse', asr: engine, asr_ms: t1 - t0, parse_ms: Date.now() - t1, engine: parse.engine, n: parse.events.length, used }));
  return json(200, { ok: true, text, asr: engine, parse, usage: { used, limit } });
});
