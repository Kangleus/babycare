/* 录音接口（原生 = expo-audio，Web = 浏览器麦克风 + Web Audio 转 16k WAV） */
export type RecResult = { b64: string; format: 'wav' | 'aac'; rate: number; ms: number };
export type Recorder = {
  /** 申请权限并开始录音；onLevel 回调 0~1 的音量，用来画波形 */
  start: (onLevel: (v: number) => void) => Promise<void>;
  stop: () => Promise<RecResult>;
  cancel: () => Promise<void>;
};
export class MicError extends Error {
  code: 'denied' | 'unsupported' | 'failed';
  constructor(code: 'denied' | 'unsupported' | 'failed', msg?: string) { super(msg ?? code); this.code = code; }
}
export const MAX_REC_MS = 60000;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** 纯 JS base64（不依赖 btoa / Buffer，原生和 Web 都能用） */
export function bytesToB64(u: Uint8Array): string {
  let out = '', i = 0;
  for (; i + 2 < u.length; i += 3) { const n = (u[i] << 16) | (u[i + 1] << 8) | u[i + 2]; out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63]; }
  if (i < u.length) { const n = (u[i] << 16) | ((i + 1 < u.length ? u[i + 1] : 0) << 8); out += B64[n >> 18] + B64[(n >> 12) & 63] + (i + 1 < u.length ? B64[(n >> 6) & 63] : '=') + '='; }
  return out;
}
