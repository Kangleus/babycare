/* 调 Edge Function ask-tuanzi。App 里没有任何 AI key：只带登录用户 JWT + publishable key。
   未登录 / 没加入家庭 / 断网 时返回错误码；紧急判断在本机就能做（规则），不需要联网。 */
import { CLOUD } from '@/data/cloud-config';
import { supabase, SUPABASE_URL } from '@/data/supabase';
import { cloud } from '@/data/sync';
import type { BabyRecord } from '@/data/types';
import { ruleTier, urgentCard, type Tier, type UrgentCard } from '../../supabase/functions/_shared/ask-core';

export const ASK_URL = process.env.EXPO_PUBLIC_ASK_FN_URL || `${SUPABASE_URL}/functions/v1/ask-tuanzi`;

export type AskAnswer = {
  concl: string; body: string;
  chart?: { metric: string; unit: string; avg: number | null; points: { label: string; value: number | null; low?: boolean }[] };
  events?: { left: string; right: string }[];
  cites: string[]; footer?: string;
  action?: { type: 'open_summary'; aud: 'doctor' | 'granny'; range: 1 | 3 | 7 };
  mood: 'idle' | 'happy' | 'worry';
};
export type AskMsg =
  | { id: string; who: 'me'; text: string }
  | { id: string; who: 'bot'; kind: 'typing' }
  | { id: string; who: 'bot'; kind: 'answer'; a: AskAnswer; fb?: boolean }
  | { id: string; who: 'bot'; kind: 'urgent'; card: UrgentCard }
  | { id: string; who: 'bot'; kind: 'login' }
  | { id: string; who: 'bot'; kind: 'error'; message: string; retry?: string };

export type AskOk = {
  ok: true; tier: Tier; urgent?: { reasons: string[] }; answer: AskAnswer | null;
  usage: { used: number; limit: number } | null;
  meta: { rounds: number; tools: number; rewritten: boolean; fallback: boolean; ms: number };
};
export type AskFail = {
  ok: false;
  code: 'signed_out' | 'offline' | 'auth' | 'not_member' | 'not_configured' | 'quota' | 'bad_request' | 'empty' | 'db' | 'llm_failed' | 'timeout' | 'error';
  message: string;
};

/** 本机紧急判断：不联网、不计次。命中就用本机记录渲染紧急卡。 */
export function askLocalUrgent(
  question: string, records: BabyRecord[], now: Date, babyName: string, ageDays: number, latestTemp?: { v: number; at: number },
): { tier: 'urgent'; reasons: string[]; card: UrgentCard } | null {
  const r = ruleTier(question, { ageDays, nowMs: +now, ...(latestTemp ? { latestTemp } : {}) });
  if (r.tier !== 'urgent') return null;
  return { tier: 'urgent', reasons: r.reasons, card: localUrgentCard(r.reasons, records, now, babyName) };
}

/** 服务端判紧急时，用本机记录渲染同样的紧急卡 */
export const localUrgentCard = (reasons: string[], records: BabyRecord[], now: Date, babyName: string) =>
  urgentCard(reasons, records.map(x => ({ type: x.type, time: x.time, endTime: x.endTime ?? null, values: x.values as Record<string, unknown>, createdBy: x.createdBy })), now, babyName);

/** 是否已登录并加入家庭（工具要读云端记录，服务端按家庭计次） */
export const askReady = (babyId?: string) => {
  const link = cloud.state.link;
  return !!link && !!babyId && link.babyId === babyId && !!cloud.state.userId;
};

export async function askRemote(question: string, babyId: string, history: { q: string; a: string }[] = []): Promise<AskOk | AskFail> {
  if (!askReady(babyId)) return { ok: false, code: 'signed_out', message: '登录并加入家庭后团团才能翻记录回答' };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, code: 'auth', message: '登录已过期，请重新登录' };
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 30000);
  try {
    const r = await fetch(ASK_URL, {
      method: 'POST', signal: ac.signal,
      headers: { Authorization: `Bearer ${token}`, apikey: CLOUD.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        babyId, question: question.slice(0, 200), tzOffsetMin: new Date().getTimezoneOffset(),
        history: history.slice(-3).map(h => ({ q: h.q.slice(0, 300), a: h.a.slice(0, 300) })),
      }),
    });
    const j = await r.json().catch(() => null) as (AskOk | AskFail | null);
    if (j && j.ok) return j;
    if (j && !j.ok && j.code) return { ok: false, code: j.code, message: j.message || '团团没答上来' };
    return { ok: false, code: r.status === 404 ? 'not_configured' : 'error', message: r.status === 404 ? '问团子还没上线' : '团团暂时没连上' };
  } catch (e) {
    return /abort|timeout/i.test((e as Error).message || '')
      ? { ok: false, code: 'timeout', message: '团团想得有点久，再问一次试试' }
      : { ok: false, code: 'offline', message: '网络不太好，等会儿再问我' };
  } finally { clearTimeout(t); }
}

/* 示例模式（只读豆米）的预置回答：不调 Edge Function、不计次、不花钱。
   内容是写死的，但数字取自示例数据，看起来才像真的在翻记录。 */
export function demoAnswer(q: string, stats: { feed: number; ml: number; diapers: number; sleepH: number }, name: string): AskAnswer {
  const t = q.replace(/\s/g, '');
  const base = { cites: ['示例数据 · 近 7 天'], mood: 'idle' as const };
  if (/睡|夜醒|小睡/.test(t)) {
    return { ...base, concl: `${name}最近 7 天每天睡 ${stats.sleepH} 小时左右`, body: `白天小睡 2–3 次、夜里会醒 1–2 次，都是这个月龄常见的。\n\n示例模式只能看不能记，想记自己的宝宝点顶部「开始记我家宝宝」。` };
  }
  if (/奶|喂|吃/.test(t)) {
    return { ...base, concl: `${name}今天喝了 ${stats.feed} 顿、共 ${stats.ml} ml`, body: `最近 7 天的喂奶间隔大约 3 小时，晚上会拉长到 4–5 小时。\n\n这是示例数据，按需喂养优先。` };
  }
  if (/拉|便|尿/.test(t)) {
    return { ...base, concl: `${name}今天换了 ${stats.diapers} 次尿布`, body: '小便清亮、每天 6 次以上一般没问题；大便颜色和性状比次数更值得留意。\n\n这是示例数据。' };
  }
  return { ...base, concl: `这是示例宝宝「${name}」的演示数据`, body: `团团在示例模式里只按豆米这 14 天的记录回答，不会联网、也不会调用 AI。\n\n想记自己的宝宝，点顶部「开始记我家宝宝」。` };
}
