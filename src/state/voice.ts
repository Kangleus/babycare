/* 语音记录的小状态机（idle → listen → thinking → confirm / type），给底部团子按钮和 VoiceLayer 共用 */
import { useSyncExternalStore } from 'react';
import type { VoiceParse } from '@/lib/voice-api';
import type { BabyRecord } from '@/data/types';

export type Phase = 'idle' | 'listen' | 'thinking' | 'confirm' | 'type';
export type Target = { rec: BabyRecord; from: number | null; found: boolean } | null;
export type Draft = { text: string; parse: VoiceParse; asr: string; editing: number; paused: boolean; target: Target };
export type VState = { phase: Phase; bars: number[]; cancel: boolean; draft: Draft | null; typeReason: string | null; typeText: string; busy: boolean };

const BARS = 22;
let st: VState = { phase: 'idle', bars: Array(BARS).fill(8), cancel: false, draft: null, typeReason: null, typeText: '', busy: false };
const ls = new Set<() => void>();
export const voice = {
  get: () => st,
  set(p: Partial<VState>) { st = { ...st, ...p }; ls.forEach(f => f()); },
  sub(f: () => void) { ls.add(f); return () => { ls.delete(f); }; },
  /** 音量 → 原型 .wave 的 22 根波形（8~50px） */
  level(v: number) {
    const t = Date.now() / 140;
    voice.set({ bars: Array.from({ length: BARS }, (_, i) => { const c = Math.sin(t + i * 0.7) * 0.5 + 0.5; return 8 + (Math.random() * 30 * c + 12 * c) * Math.min(1, 0.15 + v); }) });
  },
  resetBars() { voice.set({ bars: Array(BARS).fill(8) }); },
  /** 由 VoiceLayer 注册：按下 / 松开 / 打字 */
  h: { begin: () => {}, end: (_short: boolean) => {}, openType: (_reason?: string, _text?: string) => {} } as {
    begin: () => void; end: (short: boolean) => void; openType: (reason?: string, text?: string) => void;
  },
};
export function useVoice() { return useSyncExternalStore(voice.sub, voice.get, voice.get); }
