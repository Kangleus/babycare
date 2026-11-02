/* 问团子的模型部分：分类 → agent 循环（Function Calling）→ 回答检查 → 改写 / 兜底。
   数据通过注入的 DataSource 拿（Edge Function 用用户 JWT 的 PostgREST；评测用 fixture）。
   ⚠️ 这里不发 service_role、不拼客户端传来的 family_id；只读当前宝宝。
   设计依据：docs/M5-ASK-AGENT.md §3.5、§4、§5、§6.1、§12。 */

import {
  buildCites, fallbackOf, footerOf, postCheck, ruleTier, stricter,
  type RuleTier, type Tier, type Violation,
} from './ask-core.ts';
import { computeStats, queryEvents, type Metric, type RangeKey, type RecordRow } from './ask-stats.ts';

const BASE = 'https://dashscope.aliyuncs.com';
const CHAT = `${BASE}/compatible-mode/v1/chat/completions`;
const TOTAL_BUDGET_MS = 25000;
const MAX_ROUNDS = 4;
const MAX_TOOLS = 5;
const MAX_RESULT_CHARS = 2500;

export type Baby = { name: string; birthday: string; gender: 'girl' | 'boy'; feeding: 'formula' | 'bm' | 'breast' };
export type HealthRaw = {
  allergies: { name: string }[];
  episodes: { title: string; start_date: string; end_date: string | null; status: 'active' | 'recovered' }[];
  vaccines: { name: string; given_on: string }[];
  reminders: { cat: string; title: string; due_at: string; repeat: string; done_at: string | null }[];
};

export interface DataSource {
  baby(): Promise<Baby>;
  records(fromIso: string, toIso: string): Promise<RecordRow[]>;
  health(): Promise<HealthRaw>;
}

export type ToolCall = { id: string; kind: string; args: Record<string, unknown>; callId: string; result: unknown };

export type AskAnswer = {
  concl: string;
  body: string;
  chart?: { metric: string; unit: string; avg: number | null; points: { label: string; value: number | null; low?: boolean }[] };
  events?: { left: string; right: string }[];
  cites: string[];
  footer?: string;
  action?: { type: 'open_summary'; aud: 'doctor' | 'granny'; range: 1 | 3 | 7 };
  mood: 'idle' | 'happy' | 'worry';
};

export type Usage = { in: number; out: number };

export type AskResult = {
  tier: Tier;
  urgent?: { reasons: string[] };
  answer: AskAnswer | null;
  meta: { rounds: number; tools: number; rewritten: boolean; fallback: boolean; ms: number; usage: Usage };
};

/* ---------- 提示词（全文，别改口径） ---------- */

export const CLASSIFY_PROMPT = (name: string, ageText: string, ageDays: number) => `你是育儿 App「团子育儿本」的问题分诊员，只做分类，不回答问题。
宝宝：${name}，${ageText}（${ageDays} 天）。
把家长的问题分成一档，输出 JSON：{"tier":"life|health|urgent|off_topic","signals":["..."]}

- urgent：可能需要马上就医的情况。包括：体温≥38℃；3 个月以下宝宝发烧或身上烫；抽搐、翻白眼；呼吸急促或困难、嘴唇发紫；精神很差、叫不醒、软绵绵；长时间不吃奶或不尿；喷射状呕吐、吐血便血；摔到头、误吞东西、烫伤、严重过敏（脸或嘴唇肿）。只要有可能，就选 urgent。
- health：和身体健康、症状、用药、疾病有关，但没有上面的危险信号。例如：便便颜色、湿疹、咳嗽几天、体温 37.5～37.9℃ 且精神好、问药量、问是不是某种病、问疫苗反应。
- life：日常照护、喂养辅食、睡眠作息、发育里程碑、记录数据（吃了多少、睡了多久、夜醒几次）、亲子互动。
- off_topic：和宝宝、育儿、家长自身照护都无关（例如写代码、讲笑话、问股票）。

signals 写命中的关键信号，最多 3 个，没有就写 []。只输出 JSON。`;

const TIER_RULE = {
  life: (name: string) => `这是日常照护问题。正常、具体地回答，给可操作的小建议（2～4 条）。通用育儿常识按国家卫健委、中国营养学会等主流指南的口径说，不确定的不说。能结合${name}的记录就结合。`,
  health: (name: string) => `这是一般健康问题。只说三件事：① 常见原因（不针对${name}下结论）② 在家能做的护理和要观察什么 ③ 出现哪些情况要去看医生。不诊断、不说药名、不给剂量和喂水量。先用工具看看${name}最近相关的记录（体温、症状、用药、吃睡），有异常就点出来。`,
} as const;

const FEEDN: Record<Baby['feeding'], string> = { formula: '奶粉', bm: '瓶喂母乳', breast: '亲喂' };

export function systemPrompt(o: {
  baby: Baby; ageText: string; ageDays: number; allergies: string; episode: string; now: string; tier: 'life' | 'health';
}): string {
  const { baby, ageText, ageDays, allergies, episode, now, tier } = o;
  const ta = baby.gender === 'girl' ? '她' : '他';
  return `你是「团团」，团子育儿本 App 里的小团子，${baby.name} 家的专属育儿小帮手。说话像一个靠谱又温柔的朋友：口语、简短、先说结论，偶尔带一个「～」，不用表情符号，不卖萌过头。称呼宝宝用名字「${baby.name}」或「${ta}」。

【你认识的宝宝】
- ${baby.name}，${ageText}（出生第 ${ageDays} 天），喂养方式：${FEEDN[baby.feeding]}
- 过敏：${allergies}；当前病程：${episode}
- 现在是 ${now}（家长当地时间）

【你怎么回答】
1. 先查再答：凡是问到${baby.name}自己的情况（吃、睡、尿布、体温、用药记录、夜醒、成长、疫苗、提醒），必须先调用工具拿数据，不许凭印象说。
2. 数字只能来自工具结果。工具没给的数字不许写；记录里没有就直说「记录里没有这段时间的数据」，不要猜，不要补。
3. 回答里点明依据，例如「根据过去 7 天的记录」「昨晚的 5 条记录」。
4. 比较只和${baby.name}自己的历史比。可以提一句常见月龄参考范围，但要说「每个宝宝不同」。
5. 最后必须调用 reply 结束：concl 一句话结论（≤24 字），body 正文（≤220 字，可以用 **加粗** 标数字），需要时用 chart 引用 get_stats 的 call_id、用 events 引用 query_events 的 call_id。
6. 最多查 3 次就要回答。
7. 只聊和宝宝、育儿、家长照护有关的事；别的事礼貌地说团团只会聊宝宝。

【安全规则，任何情况下都不能违反】
- 不诊断：不说「${baby.name}是/得了/应该是/可能是 某某病」。可以说「常见原因有……」，然后说明需要医生判断。
- 不说任何药名（记录里家长记过的药名除外，引用时用「」括起来并注明「家长记录」），不给任何用药剂量、次数、间隔，不建议吃药或停药。问到药量一律回答：用药和剂量要听医生或药师的，团团不提供。
- 不给喂水量（多少毫升、几杯），不评价「喝够没有」。
- 不给偏方，不推荐保健品、具体品牌和商品。
- 体温：37.5℃ 及以上写「偏高」；38℃ 及以上写「建议及时就医」。
- 只要家长描述里出现：精神很差、呼吸急促或困难、抽搐、持续高烧不退、不吃不尿、3 个月以下发烧——不要分析，直接让家长尽快就医或拨打 120。
- 你不是医生，不要说「放心，没事」「不用去医院」这类保证。

【本题档位：${tier}】
${TIER_RULE[tier](baby.name)}`;
}

/* ---------- 工具定义 ---------- */

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'query_events',
      description: '查宝宝在某段时间的原始记录明细（喂奶、睡眠、尿布、喝水、用药、体温、症状、身高体重、洗澡）。回答“昨晚醒了几次”“今天吃了几顿”“上次便便是什么时候”这类问题时用。',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['all', 'feed', 'sleep', 'diaper', 'poop', 'water', 'med', 'temp', 'symptom', 'growth', 'bath'], description: '记录类型，poop 表示有便便的尿布' },
          range: { type: 'string', enum: ['today', 'last_night', 'yesterday', 'last_3d', 'last_7d', 'last_14d', 'last_30d', 'date'], description: '时间范围。last_night = 昨天 18:00 到今天 09:00（若现在早于 09:00 则到现在）' },
          date: { type: 'string', description: 'range=date 时必填，格式 YYYY-MM-DD，只能是最近 30 天内' },
          limit: { type: 'integer', minimum: 1, maximum: 40, description: '最多返回多少条，默认 30，按时间倒序取最新的' },
        },
        required: ['type', 'range'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_stats',
      description: '算宝宝某项指标最近几天的日均、每天的值和趋势对比（数字全部由代码算好）。回答“最近是不是睡少了”“这周奶量正常吗”“夜醒是不是变多了”这类问题时用。',
      parameters: {
        type: 'object',
        properties: {
          metric: { type: 'string', enum: ['sleep', 'feed', 'diaper', 'poop', 'water', 'temp', 'night_wakes', 'growth'] },
          days: { type: 'integer', enum: [3, 7, 14, 30], description: '统计最近几天，默认 7' },
          compare_previous: { type: 'boolean', description: '是否和再往前同样长度的一段对比，默认 true' },
        },
        required: ['metric'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_health_profile',
      description: '读宝宝的健康档案：过敏、当前和最近 90 天的病程、已打疫苗、接下来 7 天的提醒。回答“最近一次打的什么疫苗”“下次复诊是什么时候”“他对什么过敏”时用。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_summary',
      description: '在回答下面放一个按钮，让家长一键生成给医生或给家人的摘要便签。家长说“帮我整理给医生看”“要去医院了”“给奶奶交代一下”时用。',
      parameters: {
        type: 'object',
        properties: {
          aud: { type: 'string', enum: ['doctor', 'granny'] },
          range: { type: 'integer', enum: [1, 3, 7] },
        },
        required: ['aud'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reply',
      description: '给家长的最终回答。必须调用它来结束本次回答。',
      parameters: {
        type: 'object',
        properties: {
          concl: { type: 'string', description: '一句话结论，不超过 24 个字' },
          body: { type: 'string', description: '正文，不超过 220 个字；可以用 **加粗** 标重点数字；不要用其它 markdown' },
          chart: { type: 'string', description: '要展示的 get_stats 结果的 call_id，可不填' },
          events: { type: 'string', description: '要列出的 query_events 结果的 call_id，最多显示 6 条，可不填' },
          mood: { type: 'string', enum: ['idle', 'happy', 'worry'] },
        },
        required: ['concl', 'body'],
      },
    },
  },
];

/* ---------- 百炼调用 ---------- */

type Msg = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]; tool_call_id?: string };

async function chat(key: string, body: Record<string, unknown>, timeoutMs: number, usage?: Usage): Promise<{ message?: { content?: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }; usage?: { prompt_tokens?: number; completion_tokens?: number } }> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(CHAT, {
      method: 'POST', signal: ac.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      const err = new Error(`llm_http_${r.status}`) as Error & { status?: number; body?: string };
      err.status = r.status; err.body = text.slice(0, 300);
      throw err;
    }
    const j = await r.json() as { choices?: { message?: Msg }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    if (usage && j.usage) { usage.in += j.usage.prompt_tokens ?? 0; usage.out += j.usage.completion_tokens ?? 0; }
    return { message: j.choices?.[0]?.message as Msg | undefined, usage: j.usage };
  } finally { clearTimeout(t); }
}

const retriable = (e: unknown) => {
  const s = (e as { status?: number }).status;
  const m = (e as Error).message || '';
  return s === 429 || (s !== undefined && s >= 500) || /abort|timeout/i.test(m);
};

/** 分类：失败返回 null，调用方只用规则档位 */
export async function classifyTier(key: string, question: string, baby: Baby, ageText: string, ageDays: number, timeoutMs = 6000, usage?: Usage): Promise<Tier | null> {
  try {
    const { message } = await chat(key, {
      model: 'qwen-flash', temperature: 0, max_tokens: 120, enable_thinking: false,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: CLASSIFY_PROMPT(baby.name, ageText, ageDays) },
        { role: 'user', content: question.slice(0, 200) },
      ],
    }, timeoutMs, usage);
    const raw = message?.content ?? '';
    const m = /\{[\s\S]*\}/.exec(raw);
    if (!m) return null;
    const tier = JSON.parse(m[0]).tier;
    return ['life', 'health', 'urgent', 'off_topic'].includes(tier) ? tier as Tier : null;
  } catch { return null; }
}

/* ---------- 工具执行 ---------- */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function executeTool(
  call: { id: string; name: string; args: Record<string, unknown> },
  ctx: { ds: DataSource; tz: number; nowMs: number; callSeq: number },
): Promise<{ callId: string; fn: string; result: Record<string, unknown> }> {
  const callId = `t${ctx.callSeq}`;
  const bad = (msg: string) => ({ callId, fn: call.name, result: { error: msg } });
  const args = call.args ?? {};

  if (call.name === 'query_events') {
    const types = ['all', 'feed', 'sleep', 'diaper', 'poop', 'water', 'med', 'temp', 'symptom', 'growth', 'bath'];
    const ranges: RangeKey[] = ['today', 'last_night', 'yesterday', 'last_3d', 'last_7d', 'last_14d', 'last_30d', 'date'];
    if (!types.includes(String(args.type))) return bad(`参数不对：type 只能是 ${types.join(' / ')}`);
    if (!ranges.includes(args.range as RangeKey)) return bad(`参数不对：range 只能是 ${ranges.join(' / ')}`);
    if (args.range === 'date') {
      if (!DATE_RE.test(String(args.date ?? ''))) return bad('参数不对：range=date 时必须给 date（YYYY-MM-DD）');
      const days = (ctx.nowMs - Date.parse(`${args.date}T00:00:00Z`)) / 86400000;
      if (days > 30 || days < 0) return bad('参数不对：date 只能是最近 30 天内');
    }
    const limit = Math.max(1, Math.min(40, Number(args.limit) || 30));
    const from = new Date(ctx.nowMs - 31 * 86400000).toISOString();
    const rows = await ctx.ds.records(from, new Date(ctx.nowMs).toISOString());
    const res = queryEvents(rows, String(args.type), args.range as RangeKey, ctx.tz, ctx.nowMs, limit, args.date as string | undefined);
    return { callId, fn: call.name, result: res as unknown as Record<string, unknown> };
  }

  if (call.name === 'get_stats') {
    const metrics: Metric[] = ['sleep', 'feed', 'diaper', 'poop', 'water', 'temp', 'night_wakes', 'growth'];
    if (!metrics.includes(args.metric as Metric)) return bad(`参数不对：metric 只能是 ${metrics.join(' / ')}`);
    const days = [3, 7, 14, 30].includes(Number(args.days)) ? Number(args.days) : 7;
    const cmp = args.compare_previous === undefined ? true : !!args.compare_previous;
    const from = new Date(ctx.nowMs - (days * 2 + 2) * 86400000).toISOString();
    const rows = await ctx.ds.records(from, new Date(ctx.nowMs).toISOString());
    const res = computeStats(rows, args.metric as Metric, days, ctx.tz, ctx.nowMs, cmp);
    return { callId, fn: call.name, result: { ...res, days } };
  }

  if (call.name === 'get_health_profile') {
    const h = await ctx.ds.health();
    const md = (iso: string) => { const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`); return `${d.getUTCMonth() + 1}/${String(d.getUTCDate()).padStart(2, '0')}`; };
    const active = h.episodes.find(e => e.status === 'active');
    const res = {
      call_id: callId,
      allergies: h.allergies.map(a => a.name),
      active_episode: active ? { title: `${active.title}（家长记录）`, start: md(active.start_date), days: Math.round((ctx.nowMs - Date.parse(`${active.start_date}T00:00:00+08:00`)) / 86400000) + 1 } : null,
      recent_episodes: h.episodes.filter(e => e.status === 'recovered').slice(0, 3).map(e => ({ title: `${e.title}（家长记录）`, range: `${md(e.start_date)}–${md(e.end_date ?? e.start_date)}`, status: '已康复' })),
      vaccines: h.vaccines.slice(-5).map(v => ({ name: v.name, date: md(v.given_on) })),
      upcoming: h.reminders.filter(r => !r.done_at && Date.parse(r.due_at) >= ctx.nowMs && Date.parse(r.due_at) - ctx.nowMs <= 7 * 86400000)
        .slice(0, 5).map(r => ({ cat: r.cat, title: r.title, when: new Date(Date.parse(r.due_at) - ctx.tz * 60000).toISOString().slice(5, 16).replace('T', ' ') })),
    };
    return { callId, fn: call.name, result: res };
  }

  if (call.name === 'open_summary') {
    if (!['doctor', 'granny'].includes(String(args.aud))) return bad('参数不对：aud 只能是 doctor / granny');
    const range = [1, 3, 7].includes(Number(args.range)) ? Number(args.range) : 3;
    return { callId, fn: call.name, result: { call_id: callId, ok: true, aud: args.aud, range } };
  }

  return bad(`没有这个工具：${call.name}`);
}

const clip = (r: { callId: string; fn: string; result: Record<string, unknown> }) => {
  let s = JSON.stringify(r.result);
  if (s.length > MAX_RESULT_CHARS) {
    s = s.slice(0, MAX_RESULT_CHARS - 40);
    return `${s}…","truncated":true}`;
  }
  return s;
};

/* ---------- agent 循环 ---------- */

type RunOut = {
  reply: { concl: string; body: string; chart?: string; events?: string; mood?: 'idle' | 'happy' | 'worry' } | null;
  calls: { callId: string; fn: string; result: Record<string, unknown> }[];
  rounds: number;
};

export async function runAgent(o: {
  key: string; question: string; sys: string; ds: DataSource; tz: number; nowMs: number;
  history?: { q: string; a: string }[]; startedAt: number; usage?: Usage;
}): Promise<RunOut> {
  const msgs: Msg[] = [{ role: 'system', content: o.sys }];
  for (const h of (o.history ?? []).slice(-3)) {
    msgs.push({ role: 'user', content: h.q.slice(0, 300) });
    msgs.push({ role: 'assistant', content: h.a.replace(/\*\*/g, '').slice(0, 300) });
  }
  msgs.push({ role: 'user', content: o.question.slice(0, 200) });

  const calls: RunOut['calls'] = [];
  let toolsUsed = 0;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const left = TOTAL_BUDGET_MS - (Date.now() - o.startedAt);
    if (left < 1500) break;
    const last = round === MAX_ROUNDS;
    const body: Record<string, unknown> = {
      model: 'qwen-plus', messages: msgs, temperature: 0.3, max_tokens: 700, enable_thinking: false,
      tools: last ? [TOOLS[4]] : TOOLS,
      ...(last ? { tool_choice: { type: 'function', function: { name: 'reply' } } } : { tool_choice: 'auto', parallel_tool_calls: true }),
    };

    let res;
    try {
      res = await chat(o.key, body, Math.min(12000, Math.max(2000, left - 500)), o.usage);
    } catch (e) {
      if (retriable(e) && Date.now() - o.startedAt < TOTAL_BUDGET_MS - 3000) {
        try { res = await chat(o.key, body, Math.min(12000, Math.max(2000, TOTAL_BUDGET_MS - (Date.now() - o.startedAt) - 500)), o.usage); }
        catch (e2) { throw e2; }
      } else throw e;
    }

    const m = res.message;
    const tcs = m?.tool_calls ?? [];
    if (!tcs.length) {
      // 没调 reply 就给了纯文本：第一句当结论，其余当正文
      const text = (m?.content ?? '').trim();
      if (!text) continue;
      const [first, ...rest] = text.split(/(?<=[。！？!?])/);
      return { reply: { concl: first.replace(/[。！？!?]$/, '').slice(0, 24), body: rest.join('').slice(0, 220) }, calls, rounds: round };
    }

    msgs.push({ role: 'assistant', content: m?.content ?? null, tool_calls: tcs });

    let reply: RunOut['reply'] = null;
    for (const tc of tcs) {
      const name = tc.function?.name ?? '';
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { args = {}; }
      if (name === 'reply') {
        reply = {
          concl: String(args.concl ?? '').slice(0, 40),
          body: String(args.body ?? '').slice(0, 400),
          chart: args.chart ? String(args.chart) : undefined,
          events: args.events ? String(args.events) : undefined,
          mood: ['idle', 'happy', 'worry'].includes(String(args.mood)) ? args.mood as never : 'idle',
        };
        msgs.push({ role: 'tool', tool_call_id: tc.id, content: '{"ok":true}' });
        continue;
      }
      if (toolsUsed >= MAX_TOOLS) {
        msgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ error: '本次查询次数已用完，请直接用已有数据回答' }) });
        continue;
      }
      toolsUsed++;
      const out = await executeTool({ id: tc.id, name, args }, { ds: o.ds, tz: o.tz, nowMs: o.nowMs, callSeq: calls.length + 1 });
      calls.push({ callId: out.callId, fn: out.fn, result: out.result as Record<string, unknown> });
      msgs.push({ role: 'tool', tool_call_id: tc.id, content: clip(out) });
    }
    if (reply?.concl && reply.body) return { reply, calls, rounds: round };
  }
  return { reply: null, calls, rounds: MAX_ROUNDS };
}

/* ---------- 改写 ---------- */

const VIOLATION_CN: Record<Violation['code'], string> = {
  dose: '给了用药剂量 / 次数', water: '给了喂水量', drug: '提到了不该说的药名',
  diag: '做了诊断', reassure: '给了「不用去医院」这类保证', numbers: '用了工具结果里没有的数字',
};

export async function rewriteAnswer(
  key: string, answer: { concl: string; body: string }, violations: Violation[], timeoutMs = 8000, usage?: Usage,
): Promise<{ concl: string; body: string } | null> {
  const list = [...new Set(violations.map(v => VIOLATION_CN[v.code]))].map((s, i) => `${i + 1}. ${s}`).join('\n');
  try {
    const { message } = await chat(key, {
      model: 'qwen-plus', temperature: 0, max_tokens: 500, enable_thinking: false,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: `下面是一段给家长的回答，它违反了这些规则：\n${list}。\n请改写：删掉违规的内容，其余意思保持，不要新增任何数字、药名或疾病名，仍然先给一句结论。\n输出 JSON：{"concl":"…","body":"…"}\n原回答：${answer.concl}。${answer.body}`,
      }],
    }, timeoutMs, usage);
    const m = /\{[\s\S]*\}/.exec(message?.content ?? '');
    if (!m) return null;
    const j = JSON.parse(m[0]);
    if (!j.concl || !j.body) return null;
    return { concl: String(j.concl).slice(0, 40), body: String(j.body).slice(0, 400) };
  } catch { return null; }
}

/* ---------- 编排：一条问题的完整回答 ---------- */

const HARD = ['dose', 'water', 'drug', 'diag', 'reassure'] as const;

export async function answerQuestion(o: {
  key: string; ds: DataSource; question: string; tz: number; nowMs: number;
  ageDays: number; ageText: string; history?: { q: string; a: string }[];
  tierRule?: RuleTier; latestTemp?: { v: number; at: number };
}): Promise<AskResult> {
  const startedAt = Date.now();
  const usage: Usage = { in: 0, out: 0 };
  const baby = await o.ds.baby();
  const ruleCtx = { ageDays: o.ageDays, nowMs: o.nowMs, ...(o.latestTemp ? { latestTemp: o.latestTemp } : {}) };
  const ruleRes = o.tierRule ? { tier: o.tierRule, reasons: [] as string[] } : ruleTier(o.question, ruleCtx);
  const rule = ruleRes.tier;
  const done = (tier: Tier, answer: AskAnswer | null, extra: Partial<AskResult['meta']> = {}, urgent?: { reasons: string[] }): AskResult => ({
    tier, ...(urgent ? { urgent } : {}), answer,
    meta: { rounds: 0, tools: 0, rewritten: false, fallback: false, ms: Date.now() - startedAt, usage, ...extra },
  });

  // 规则判紧急：不进模型、不计次
  if (rule === 'urgent') return done('urgent', null, {}, { reasons: ruleRes.reasons });

  const llm = await classifyTier(o.key, o.question, baby, o.ageText, o.ageDays, 6000, usage);
  let tier: Tier;
  if (llm === 'urgent') tier = 'urgent';
  else if (llm === 'off_topic' && rule === 'life') tier = 'off_topic';
  else tier = stricter(rule, llm === 'health' ? 'health' : 'life');
  if (tier === 'urgent') return done('urgent', null, {}, { reasons: ['llm_urgent'] });
  if (tier === 'off_topic') {
    return done('off_topic', { concl: '团团只会聊宝宝哦', body: '吃奶、睡觉、尿布、辅食、哄睡这些都可以问我～', cites: [], mood: 'idle' });
  }

  const h = await o.ds.health();
  const allergies = h.allergies.length ? h.allergies.map(a => a.name).join('、') : '暂无已知';
  const ep = h.episodes.find(e => e.status === 'active');
  const l = new Date(o.nowMs - o.tz * 60000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const now = `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())} 周${'日一二三四五六'[l.getUTCDay()]} ${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}`;
  const sys = systemPrompt({
    baby, ageText: o.ageText, ageDays: o.ageDays, allergies,
    episode: ep ? `${ep.title}（家长记录）第 ${Math.round((o.nowMs - Date.parse(`${ep.start_date}T00:00:00+08:00`)) / 86400000) + 1} 天` : '无',
    now, tier: tier === 'health' ? 'health' : 'life',
  });

  const run = await runAgent({ key: o.key, question: o.question, sys, ds: o.ds, tz: o.tz, nowMs: o.nowMs, history: o.history, startedAt, usage });
  const fallbackResult = (extra: Partial<AskResult['meta']> = {}) => {
    const fb = fallbackOf(tier === 'health' ? 'health' : 'life', baby.name);
    return done(tier, { ...fb, cites: [], footer: footerOf(tier), mood: 'worry' }, { rounds: run.rounds, tools: run.calls.length, fallback: true, ...extra });
  };
  if (!run.reply) return fallbackResult();

  /* 回答检查 → 改写一次 → 仍违规就用兜底话术 */
  let { concl, body } = run.reply;
  const toolForCheck = run.calls.map(c => ({ fn: c.fn, result: c.result }));
  let check = postCheck({ concl, body }, toolForCheck);
  let rewritten = false;
  if (!check.ok) {
    const hard = check.violations.some(v => (HARD as readonly string[]).includes(v.code));
    if (hard) {
      const rw = await rewriteAnswer(o.key, { concl, body }, check.violations, 8000, usage);
      rewritten = !!rw;
      if (!rw) return fallbackResult({ rewritten: false });
      const again = postCheck(rw, toolForCheck);
      if (again.violations.some(v => (HARD as readonly string[]).includes(v.code))) {
        return fallbackResult({ rewritten: true });
      }
      concl = rw.concl; body = rw.body; check = again;
    }
    // 只剩 numbers 的违规：放行（用补过字的版本），只记日志
    body = check.patched;
  } else {
    body = check.patched;
  }

  /* 图表 / 记录列表：用 call_id 从工具结果里取 */
  const chartCall = run.calls.find(c => c.callId === run.reply!.chart && c.fn === 'get_stats');
  const chart = chartCall ? (() => {
    const r = chartCall.result as { per_day?: { label: string; value: number | null; low?: boolean }[]; unit?: string; avg?: number | null; metric?: string };
    return {
      metric: String(r.metric ?? ''), unit: String(r.unit ?? ''), avg: r.avg ?? null,
      points: (r.per_day ?? []).slice(-7).map(p => ({ label: p.label, value: p.value, ...(p.low ? { low: true } : {}) })),
    };
  })() : undefined;

  const evCall = run.calls.find(c => c.callId === run.reply!.events && c.fn === 'query_events');
  const events = evCall
    ? ((evCall.result as { events?: { time: string; text: string; by: string }[] }).events ?? []).slice(0, 6).map(e => ({ left: `${e.time} ${e.text}`, right: `${e.by}记` }))
    : undefined;

  const actionCall = run.calls.find(c => c.fn === 'open_summary');
  const action = actionCall
    ? {
      type: 'open_summary' as const,
      aud: (actionCall.result.aud === 'granny' ? 'granny' : 'doctor') as 'doctor' | 'granny',
      range: ([1, 3, 7].includes(Number(actionCall.result.range)) ? Number(actionCall.result.range) : 3) as 1 | 3 | 7,
    }
    : undefined;

  const cites = buildCites(run.calls.map(c => ({ fn: c.fn, result: c.result as Record<string, unknown> })), tier);
  if (tier === 'life' && run.calls.length === 0) cites.push('通用育儿常识');

  return done(tier, {
    concl, body, chart, events, cites,
    footer: footerOf(tier),
    ...(action ? { action } : {}),
    mood: run.reply.mood ?? 'idle',
  }, { rounds: run.rounds, tools: run.calls.length, rewritten });
}
