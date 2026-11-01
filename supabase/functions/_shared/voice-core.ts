/* 一句记 M3：语音一句话 → 结构化记录。App（本地兜底 / 展示）与 Edge Function（Deno）共用这一份纯 TS 代码：
   不 import 任何东西，不读环境变量，不碰 key。
   - 热词上下文（Fun-ASR input.context）
   - 大模型提示词 + JSON 结构
   - 校验与时间换算（模型只给相对时间，绝对时间由代码算，且不晚于现在）
   - 医疗安全：只记录，不诊断、不给剂量、不给喂水量；体温 ≥37.5 偏高、≥38 提示及时就医 */

export type VType = 'feed' | 'sleep' | 'diaper' | 'water' | 'med' | 'temp' | 'symptom' | 'growth' | 'bath';
export const VTYPES: VType[] = ['feed', 'sleep', 'diaper', 'water', 'med', 'temp', 'symptom', 'growth', 'bath'];

export type VEvent = {
  type: VType;
  time: string;            // ISO
  endTime?: string | null; // 睡眠：null = 进行中
  values: { sub?: string; ml?: number | null; mins?: number; v?: number; site?: string; name?: string; times?: number; cm?: number; kg?: number };
  note?: string;
  def?: string[];          // 用了默认值的字段（卡片上标「默认」）
  confidence: number;
};
export type VUpdate = { kind: 'feed_ml'; type: 'feed'; near: string | null; fromMl: number | null; toMl: number } | { kind: 'wake'; type: 'sleep'; at: string };
export type VClarify = { field: 'ml'; index: number; question: string; options: number[] };
export type VSafety = 'fever' | 'high' | 'symptom' | null;
export type VoiceParse = {
  text: string;
  action: 'create' | 'update' | 'none';
  events: VEvent[];
  update: VUpdate | null;
  clarify: VClarify | null;
  safety: VSafety;
  advice: boolean;          // 用户在问剂量 / 喂水量 / 病情：只给固定提示，不回答
  confidence: number;
  engine: 'llm' | 'rules';
};
export type RecentRec = { type: VType; time: string; ml?: number | null; sub?: string; ongoing?: boolean };
export type Ctx = { nowMs: number; tzOffsetMin: number; babyName?: string; feeding?: 'formula' | 'bm' | 'breast'; recent?: RecentRec[] };

/* ---------- 热词（Fun-ASR 上下文增强，≤400 字） ---------- */
export const HOTWORDS = ['喂奶', '奶粉', '母乳', '亲喂', '瓶喂', '吸奶', '毫升', '换尿布', '尿不湿', '尿尿', '拉臭臭', '便便', '拉粑粑', '睡着了', '醒了', '体温', '腋温', '耳温', '额温', '美林', '泰诺林', '布洛芬', '对乙酰氨基酚', '维生素D', '维D', '益生菌', '吐奶', '拍嗝', '湿疹', '洗澡', '身高', '体重'];
export function hotwordContext(babyName?: string): string {
  const name = (babyName || '').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 12);
  return `育儿记录常用词：${name ? `宝宝小名${name}，` : ''}${HOTWORDS.join('、')}`.slice(0, 380);
}

/* ---------- 时间 ---------- */
const pad = (n: number) => String(n).padStart(2, '0');
/** 用户所在时区的「墙上时间」：返回一个把本地字段放在 UTC 字段上的 Date */
const wall = (ms: number, tz: number) => new Date(ms - tz * 60000);
export function localStamp(ctx: Ctx): string {
  const w = wall(ctx.nowMs, ctx.tzOffsetMin);
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())} ${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())} 周${'日一二三四五六'[w.getUTCDay()]}`;
}
export function hhmmAt(iso: string, tz: number): string { const w = wall(Date.parse(iso), tz); return `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`; }
type TSpec = { clock?: string | null; day?: number | null; ago_min?: number | null } | null | undefined;
/** 相对时间 → ISO；不晚于现在；没说时间 = 现在 */
export function resolveTime(t: TSpec, ctx: Ctx): { iso: string; given: boolean } {
  const now = ctx.nowMs;
  if (t && typeof t.ago_min === 'number' && isFinite(t.ago_min) && t.ago_min >= 0 && t.ago_min <= 3 * 1440) return { iso: new Date(now - Math.round(t.ago_min) * 60000).toISOString(), given: true };
  const m = t && typeof t.clock === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(t.clock.trim()) : null;
  if (m && +m[1] < 24 && +m[2] < 60) {
    const w = wall(now, ctx.tzOffsetMin);
    const day = typeof t?.day === 'number' && t.day <= 0 && t.day >= -2 ? Math.round(t.day) : null;
    const base = Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate(), +m[1], +m[2]) + ctx.tzOffsetMin * 60000;
    let ms = base + (day ?? 0) * 86400000;
    /* 没说哪天且这个时刻还没到 → 算昨天（凌晨说「十一点喝了奶」= 昨晚 23:00） */
    if (day === null && ms > now + 5 * 60000) ms -= 86400000;
    if (ms > now) ms = now;
    return { iso: new Date(ms).toISOString(), given: true };
  }
  return { iso: new Date(now).toISOString(), given: false };
}

/* ---------- 提示词 ---------- */
export const SYSTEM_PROMPT = `你是育儿记录 App「一句记」里的记录助手「团团」。家长说了一句话（语音转写，可能有错别字、口语数字），你只负责把它拆成结构化记录，输出 JSON。
硬性规则：
1. 只抽取家长说出的事实；不诊断、不解释病因、不建议用药或剂量、不建议喝水量、不给任何育儿建议。
2. 家长在提问（如“要吃多少药”“喂多少水”“是不是发烧了”）时，把 advice 设为 true；如果问题里带了可记录的事实（如“39度要吃多少美林”里的体温 39），仍要记下事实。
3. 时间只给相对信息：clock 用 24 小时制 "HH:MM"（家长说“十点”“下午三点”“九点五十”时填写，取离现在最近的、已经过去的时刻）；day 为 0/-1/-2（今天/昨天/前天，没说就 null）；ago_min 为“半小时前”“刚才”这类相对分钟数（“刚才/刚刚”= 0）。都没说就全部为 null。
4. 类型 type 只能是：feed(喂奶) sleep(睡觉) diaper(尿布/尿尿/便便) water(喝水) med(用药) temp(体温) symptom(症状) growth(身高体重) bath(洗澡)。
   - feed：sub 为 formula(奶粉/瓶喂/冲奶) bm(瓶喂母乳/吸出来的奶) breast(亲喂/吃母乳)，没说就 null；ml 为奶量毫升（“一百五”=150，“一瓶”没说量就 null）；亲喂时长写 mins。
   - sleep：睡着/入睡写开始时间；“睡到X点”“睡了X小时”写 end（同样的时间格式）；“醒了”且没有入睡信息时，用 update.kind="wake"。
   - diaper：sub 为 pee(尿/嘘嘘) poop(拉/便便/臭臭/粑粑) both(又尿又拉)，只说换尿布就 null。
   - med：name 为药名（如 退烧药、美林、维生素D），times 次数默认 1；家长说的剂量原样放进 note，绝不自己补剂量。
   - temp：v 为摄氏度（“38度5”=38.5，“三十七度八”=37.8），site 为 腋温/耳温/额温/口温/肛温，没说就 null。
   - symptom：name 为家长描述的症状原话缩写（≤20 字）。
   - growth：cm 身长、kg 体重；bath：mins 时长。
5. 一句话里有几件事就输出几条 events，按时间顺序。
6. “刚才那次是150不是120”“上一瓶其实是150”这类改记录的话：action="update"，update={"kind":"feed_ml","near":"HH:MM 或 null","from_ml":原来的量或 null,"to_ml":新量}。
7. 和宝宝记录无关的话（闲聊、天气、购物、提醒、问候）：action="none"，events=[]。
8. 每条 event 给 confidence（0~1），听不清或拿不准时给低分。
只输出 JSON，格式：
{"action":"create|update|none","advice":false,"events":[{"type":"feed","time":{"clock":null,"day":null,"ago_min":null},"end":null,"sub":null,"ml":null,"mins":null,"v":null,"site":null,"name":null,"times":null,"cm":null,"kg":null,"note":null,"confidence":0.9}],"update":null}`;

export function buildMessages(text: string, ctx: Ctx) {
  const recent = (ctx.recent || []).slice(0, 5).map(r => `${hhmmAt(r.time, ctx.tzOffsetMin)} ${r.type}${r.ml ? ` ${r.ml}ml` : ''}${r.ongoing ? ' 进行中' : ''}`).join('；');
  const user = `现在时间：${localStamp(ctx)}\n宝宝：${ctx.babyName || '宝宝'}${recent ? `\n最近记录：${recent}` : ''}\n家长说：「${text.slice(0, 200)}」`;
  return [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: user }];
}

/* ---------- 校验 ---------- */
const num = (x: unknown) => (typeof x === 'number' && isFinite(x) ? x : typeof x === 'string' && x.trim() && isFinite(+x) ? +x : null);
const str = (x: unknown, n: number) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, n) : null);
const inR = (x: number | null, a: number, b: number) => (x !== null && x >= a && x <= b ? x : null);
const SITES = ['腋温', '耳温', '额温', '口温', '肛温'];
const ADVICE_RE = /(吃|喂|用|给|喝)(多少|几)|(多少|几)(毫升|ml|mg|毫克|滴|片|粒|袋|勺|水)|剂量|用量|怎么办|要不要(吃|去|喂|用)|是不是(病|发烧|感冒|肺炎|过敏)|正常吗|严重吗/i;
const DOSE_RE = /(\d+(\.\d+)?)\s*(ml|毫升|mg|毫克|滴|片|粒|袋|包|支|勺)/gi;

export function safetyOf(events: VEvent[]): VSafety {
  if (events.some(e => e.type === 'temp' && (e.values.v ?? 0) >= 38)) return 'fever';
  if (events.some(e => e.type === 'symptom')) return 'symptom';
  if (events.some(e => e.type === 'temp' && (e.values.v ?? 0) >= 37.5)) return 'high';
  return null;
}

export function validateParse(raw: unknown, text: string, ctx: Ctx, engine: VoiceParse['engine'] = 'llm'): VoiceParse {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const evIn = Array.isArray(o.events) ? (o.events as Record<string, unknown>[]).slice(0, 6) : [];
  const events: VEvent[] = [];
  let clarify: VClarify | null = null;
  for (const e of evIn) {
    if (!e || typeof e !== 'object') continue;
    const type = e.type as VType; if (!VTYPES.includes(type)) continue;
    const t = resolveTime(e.time as TSpec, ctx);
    const def: string[] = []; if (!t.given) def.push('time');
    const conf = Math.max(0, Math.min(1, num(e.confidence) ?? 0.7));
    const ev: VEvent = { type, time: t.iso, values: {}, confidence: Math.round(conf * 100) / 100, def };
    const note = str(e.note, 60); if (note) ev.note = note;
    const v = ev.values;
    if (type === 'feed') {
      let sub = ['formula', 'bm', 'breast'].includes(e.sub as string) ? (e.sub as string) : null;
      const ml = inR(num(e.ml), 5, 400), mins = inR(num(e.mins), 1, 120);
      if (!sub) { sub = mins && !ml ? 'breast' : ctx.feeding && ctx.feeding !== 'breast' ? ctx.feeding : ml ? 'formula' : ctx.feeding || 'formula'; def.push('sub'); }
      v.sub = sub;
      if (sub === 'breast') { v.ml = null; v.mins = mins ?? 15; if (!mins) def.push('mins'); }
      else { v.ml = ml; if (ml === null && !clarify) clarify = { field: 'ml', index: events.length, question: '喝了多少毫升呀？', options: [120, 150, 180, 210] }; }
    } else if (type === 'sleep') {
      const en = e.end as TSpec;
      if (en && (en.clock || typeof en.ago_min === 'number')) { const r = resolveTime(en, ctx); if (Date.parse(r.iso) > Date.parse(ev.time)) ev.endTime = r.iso; else ev.endTime = null; } else ev.endTime = null;
    } else if (type === 'diaper') {
      const sub = ['pee', 'poop', 'both'].includes(e.sub as string) ? (e.sub as string) : null;
      v.sub = sub ?? 'pee'; if (!sub) def.push('sub');
    } else if (type === 'water') {
      const ml = inR(num(e.ml), 1, 300); if (ml === null) continue; v.ml = ml;
    } else if (type === 'med') {
      v.name = str(e.name, 20) ?? '药'; if (!str(e.name, 20)) def.push('name');
      v.times = Math.round(inR(num(e.times), 1, 10) ?? 1);
      /* 剂量只可能来自家长原话（note）；模型自己补的数字一律不要 */
      if (ev.note && !text.replace(/\s/g, '').match(DOSE_RE)) ev.note = ev.note.replace(DOSE_RE, '').trim() || undefined;
    } else if (type === 'temp') {
      const t2 = inR(num(e.v), 34, 43); if (t2 === null) continue; v.v = Math.round(t2 * 10) / 10;
      const site = SITES.includes(e.site as string) ? (e.site as string) : null; v.site = site ?? '腋温'; if (!site) def.push('site');
    } else if (type === 'symptom') {
      v.name = str(e.name, 20) ?? str(text, 20) ?? '不舒服';
    } else if (type === 'growth') {
      const cm = inR(num(e.cm), 30, 130), kg = inR(num(e.kg), 1, 40); if (cm === null && kg === null) continue;
      if (cm !== null) v.cm = cm; if (kg !== null) v.kg = kg;
    } else if (type === 'bath') {
      const mins = inR(num(e.mins), 1, 120); v.mins = mins ?? 10; if (mins === null) def.push('mins');
    }
    events.push(ev);
  }
  events.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  if (clarify) clarify.index = events.findIndex(e => e.type === 'feed' && e.values.sub !== 'breast' && e.values.ml == null);

  let update: VUpdate | null = null;
  const u = o.update as Record<string, unknown> | null;
  if (o.action === 'update' && u && typeof u === 'object') {
    if (u.kind === 'wake') update = { kind: 'wake', type: 'sleep', at: resolveTime((u.time ?? u.at) as TSpec, ctx).iso };
    else { const to = inR(num(u.to_ml), 5, 400); if (to !== null) update = { kind: 'feed_ml', type: 'feed', near: typeof u.near === 'string' && /^\d{1,2}:\d{2}$/.test(u.near) ? u.near : null, fromMl: inR(num(u.from_ml), 5, 400), toMl: to }; }
  }
  const action: VoiceParse['action'] = update ? 'update' : events.length ? 'create' : 'none';
  const advice = o.advice === true || ADVICE_RE.test(text);
  const confidence = events.length ? Math.min(...events.map(e => e.confidence)) : update ? 0.8 : 0;
  return { text, action, events: update ? [] : events, update, clarify: update ? null : clarify, safety: update ? null : safetyOf(events), advice, confidence, engine };
}

/** 从模型输出里取出 JSON（容忍 ```json 包裹） */
export function extractJson(s: string): unknown {
  const t = s.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch { const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* fallthrough */ } } }
  return null;
}

/* ---------- 本地规则兜底（离线 / 未登录 / AI 不可用时）：只认最常见的说法 ---------- */
const CN: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
export function cnNum(s: string | undefined): number | null {
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return +s;
  let total = 0, cur = 0, seen = false;
  for (const ch of s) {
    if (ch in CN) { cur = CN[ch]; seen = true; }
    else if (ch === '十') { total += (cur || 1) * 10; cur = 0; seen = true; }
    else if (ch === '百') { total += (cur || 1) * 100; cur = 0; seen = true; }
    else return null;
  }
  /* 「一百五」= 150、「一百二」= 120 */
  if (/百[一二两三四五六七八九]$/.test(s)) return total + cur * 10;
  return seen ? total + cur : null;
}
const N = '([0-9]+(?:\\.[0-9]+)?|[零〇一二两三四五六七八九十百]+)';
function clockOf(m: RegExpExecArray, s: string, ctx: Ctx, iPart: number): TSpec {
  let h = cnNum(m[iPart + 1]) ?? 0; const mm = m[iPart + 2] === '半' ? 30 : m[iPart + 3] ? cnNum(m[iPart + 3]) ?? 0 : 0;
  const part = m[iPart];
  if ((part === '下午' || part === '晚上') && h < 12) h += 12;
  else if (part === '中午' && h < 6) h += 12;
  else if (!part && h < 12) { const w = wall(ctx.nowMs, ctx.tzOffsetMin); if ((h + 12) * 60 + mm <= w.getUTCHours() * 60 + w.getUTCMinutes()) h += 12; }
  return h < 24 ? { clock: `${pad(h)}:${pad(mm)}`, day: /昨天/.test(s) ? -1 : null, ago_min: null } : null;
}
const CLK = `(早上|上午|中午|下午|晚上|凌晨)?${N}点(半|${N}分?)?`;
export function ruleParse(text: string, ctx: Ctx): VoiceParse {
  const s = text.replace(/\s+/g, '');
  const raw: { action: string; events: Record<string, unknown>[]; update: unknown; advice?: boolean } = { action: 'create', events: [], update: null };
  /* 购物、计划、提问类不是已发生的事 */
  if (/买|下单|明天|待会|等会|打算|准备/.test(s) && !/了/.test(s.replace(/买了/, ''))) { raw.action = 'none'; return validateParse(raw, text, ctx, 'rules'); }
  let time: TSpec = null;
  const ago = new RegExp(`(半|${N})(个)?(小时|分钟)(半)?前`).exec(s);
  const range = new RegExp(`从${CLK}睡到${CLK}`).exec(s);
  const tm = new RegExp(CLK).exec(s);
  if (ago) { const n = ago[1] === '半' ? 0.5 : cnNum(ago[2]) ?? 0; time = { clock: null, day: null, ago_min: Math.round(ago[4] === '小时' ? (n + (ago[5] ? 0.5 : 0)) * 60 : n) }; }
  else if (tm) time = clockOf(tm, s, ctx, 1);
  else if (/刚|刚才|刚刚/.test(s)) time = { clock: null, day: null, ago_min: 0 };
  const upd = new RegExp(`(是|改成|其实是)${N}(毫升|ml)?不是${N}`).exec(s) || new RegExp(`不是${N}(毫升|ml)?[，,]?(是|而是)${N}`).exec(s);
  if (upd) {
    const to = upd[0].startsWith('不是') ? cnNum(upd[4]) : cnNum(upd[2]); const from = upd[0].startsWith('不是') ? cnNum(upd[1]) : cnNum(upd[4]);
    raw.action = 'update'; raw.update = { kind: 'feed_ml', near: null, from_ml: from, to_ml: to };
    return validateParse(raw, text, ctx, 'rules');
  }
  const ml = new RegExp(`${N}(毫升|ml|ML|mL)`).exec(s);
  const temp = new RegExp(`${N}度${N}?`).exec(s);
  const water = /水/.test(s) && ml;
  const medRe = /(退烧药|美林|泰诺林|布洛芬|对乙酰氨基酚|维生素D|维生素AD|维D|AD|益生菌|药)/i;
  const asking = /多少|几|吗|怎么|要不要|该/.test(s);
  const med = medRe.exec(s);
  const isMed = !!med && !asking && /吃了|喂了|喝了|用了|滴/.test(s);
  const mins = new RegExp(`${N}分钟(?!前)`).exec(s);
  if (/奶|一瓶|亲喂/.test(s) || (/喂了/.test(s) && !med)) {
    if (!water || /奶/.test(s)) raw.events.push({ type: 'feed', time, sub: /亲喂/.test(s) ? 'breast' : /母乳/.test(s) ? 'bm' : /奶粉/.test(s) ? 'formula' : null, ml: ml && !/水/.test(s) ? cnNum(ml[1]) : null, mins: /亲喂/.test(s) && mins ? cnNum(mins[1]) : null, confidence: 0.6 });
  }
  if (water) raw.events.push({ type: 'water', time: /然后|又/.test(s) ? { clock: null, day: null, ago_min: 0 } : time, ml: cnNum(ml![1]), confidence: 0.6 });
  if (/又拉又尿|又尿又拉/.test(s)) raw.events.push({ type: 'diaper', time, sub: 'both', confidence: 0.6 });
  else if (/拉了|拉一|便便|臭臭|粑粑|大便/.test(s)) raw.events.push({ type: 'diaper', time, sub: 'poop', confidence: 0.6 });
  else if (/尿|嘘嘘/.test(s)) raw.events.push({ type: 'diaper', time, sub: /尿了|尿尿|嘘嘘/.test(s) ? 'pee' : null, confidence: 0.6 });
  if (range) raw.events.push({ type: 'sleep', time: clockOf(range, s, ctx, 1), end: clockOf(range, s, ctx, 5), confidence: 0.6 });
  else if (/睡着|睡了|入睡/.test(s)) raw.events.push({ type: 'sleep', time: /然后睡/.test(s) && time?.clock ? { clock: time.clock, day: time.day, ago_min: null } : time, confidence: 0.6 });
  if (temp && /度/.test(s) && !/[0-9零一二两三四五六七八九十]度(的)?水/.test(s)) {
    const a = cnNum(temp[1]), b = temp[2] ? cnNum(temp[2]) : 0;
    const site = /耳温/.test(s) ? '耳温' : /额温/.test(s) ? '额温' : /腋温|腋下/.test(s) ? '腋温' : null;
    if (a !== null) raw.events.push({ type: 'temp', time, v: a >= 30 ? a + (b ?? 0) / 10 : a, site, confidence: 0.6 });
  }
  if (isMed) raw.events.push({ type: 'med', time, name: med![1] === '药' ? '药' : med![1], times: 1, confidence: 0.6 });
  if (/红点|疹|咳嗽|流鼻涕|鼻涕|呕吐|吐了|吐奶|拉肚子|腹泻/.test(s)) raw.events.push({ type: 'symptom', time, name: s.replace(/[，。！,.!]+$/, '').slice(0, 20), confidence: 0.5 });
  if (/洗澡|洗了澡|洗完澡/.test(s)) { const bm = new RegExp(`洗了${N}分钟`).exec(s); raw.events.push({ type: 'bath', time, mins: bm ? cnNum(bm[1]) : null, confidence: 0.6 }); }
  const cm = new RegExp(`(身高|身长)${N}`).exec(s), kg = new RegExp(`体重${N}`).exec(s);
  if (cm || kg) { const k = kg ? cnNum(kg[1]) : null; raw.events.push({ type: 'growth', time, cm: cm ? cnNum(cm[2]) : null, kg: k !== null && /斤/.test(s) && !/公斤/.test(s) ? k / 2 : k, confidence: 0.6 }); }
  if (/醒了|醒啦/.test(s) && !raw.events.length) { raw.action = 'update'; raw.update = { kind: 'wake', time }; }
  return validateParse(raw, text, ctx, 'rules');
}
