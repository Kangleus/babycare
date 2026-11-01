/* 调 Edge Function voice-parse。App 里没有任何 AI key：只带登录用户的 JWT（supabase-js 会话）和 publishable key。
   没登录 / 没加入家庭 / 断网 / AI 未配置时返回错误码，由界面走「打字 + 本地规则解析」兜底。 */
import { CLOUD } from '@/data/cloud-config';
import { supabase, SUPABASE_URL } from '@/data/supabase';
import { cloud } from '@/data/sync';
import type { BabyRecord } from '@/data/types';
import { ruleParse, type Ctx, type RecentRec, type VoiceParse } from '../../supabase/functions/_shared/voice-core';
import type { RecResult } from './recorder-types';

export type { VoiceParse, VEvent, VUpdate } from '../../supabase/functions/_shared/voice-core';
export const VOICE_URL = process.env.EXPO_PUBLIC_VOICE_FN_URL || `${SUPABASE_URL}/functions/v1/voice-parse`;

export type VoiceOk = { ok: true; text: string; parse: VoiceParse; asr: string };
export type VoiceFail = { ok: false; code: 'signed_out' | 'offline' | 'auth' | 'not_member' | 'not_configured' | 'quota' | 'asr_failed' | 'no_speech' | 'bad_audio' | 'empty' | 'error'; message: string };

export function recentOf(records: BabyRecord[], now: Date): RecentRec[] {
  return records.filter(r => +now - +new Date(r.time) < 12 * 3600000 && +new Date(r.time) <= +now)
    .sort((a, b) => +new Date(b.time) - +new Date(a.time)).slice(0, 5)
    .map(r => ({ type: r.type, time: r.time, ml: r.values.ml ?? undefined, ongoing: r.type === 'sleep' && !r.endTime ? true : undefined }));
}
export const localCtx = (records: BabyRecord[], babyName?: string, feeding?: Ctx['feeding']): Ctx =>
  ({ nowMs: Date.now(), tzOffsetMin: new Date().getTimezoneOffset(), babyName, feeding, recent: recentOf(records, new Date()) });

/** 本地规则解析（离线 / 未登录 / AI 不可用时） */
export const parseLocal = (text: string, ctx: Ctx) => ruleParse(text, ctx);

export async function parseRemote(input: { audio?: RecResult; text?: string }, babyId: string, records: BabyRecord[]): Promise<VoiceOk | VoiceFail> {
  const link = cloud.state.link;
  if (!link || link.babyId !== babyId) return { ok: false, code: 'signed_out', message: '登录并加入家庭后可以用 AI 语音' };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, code: 'signed_out', message: '登录已过期，请重新登录' };
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 30000);
  try {
    const r = await fetch(VOICE_URL, {
      method: 'POST', signal: ac.signal,
      headers: { Authorization: `Bearer ${token}`, apikey: CLOUD.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ babyId, tzOffsetMin: new Date().getTimezoneOffset(), recent: recentOf(records, new Date()),
        ...(input.audio ? { audio: { b64: input.audio.b64, format: input.audio.format, rate: input.audio.rate } } : { text: input.text }) }),
    });
    const j = await r.json().catch(() => null) as (VoiceOk | VoiceFail | null);
    if (j && j.ok) return j;
    if (j && !j.ok && j.code) return { ok: false, code: j.code, message: j.message || '团团没听清' };
    return { ok: false, code: r.status === 401 ? 'auth' : r.status === 404 ? 'not_configured' : 'error', message: r.status === 404 ? 'AI 语音还没上线，先打字试试' : '团团暂时没连上，先打字试试' };
  } catch {
    return { ok: false, code: 'offline', message: '网络不太好，先打字或手动记一笔' };
  } finally { clearTimeout(t); }
}
