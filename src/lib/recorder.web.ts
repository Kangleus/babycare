/* Web 录音：浏览器麦克风（getUserMedia）+ Web Audio 取原始 PCM，降采样到 16k 单声道，编码成 16bit WAV。
   不用 MediaRecorder：Chrome 出 webm/opus、Safari 出 mp4，Fun-ASR 都不直接收；WAV 各浏览器一致。 */
import { useMemo } from 'react';
import { bytesToB64, MAX_REC_MS, MicError, Recorder } from './recorder-types';

export * from './recorder-types';

type S = { stream: MediaStream; ctx: AudioContext; node: ScriptProcessorNode; src: MediaStreamAudioSourceNode; chunks: Float32Array[]; t0: number; rate: number };
/* 用对象持有状态（模块级 let 在 Web 构建里被压缩器错误折叠过） */
const R: { cur: S | null } = { cur: null };
/* 正在打开麦克风（getUserMedia 可能要等授权弹窗）：松手时先等它，避免「还没开始就结束」 */
let starting: Promise<void> | null = null;

function release(s: S) {
  try { s.node.disconnect(); s.src.disconnect(); } catch { /* ignore */ }
  s.stream.getTracks().forEach(t => t.stop());
  s.ctx.close().catch(() => {});
}
function toWav16k(chunks: Float32Array[], inRate: number): Uint8Array {
  const len = chunks.reduce((a, c) => a + c.length, 0);
  const all = new Float32Array(len); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  const ratio = inRate / 16000, n = Math.floor(len / ratio);
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (p: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(p + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    /* 简单平均降采样（防混叠够用） */
    const a = Math.floor(i * ratio), b = Math.min(len, Math.floor((i + 1) * ratio)); let sum = 0;
    for (let j = a; j < b; j++) sum += all[j];
    const x = Math.max(-1, Math.min(1, sum / Math.max(1, b - a)));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

async function open(onLevel: (v: number) => void) {
  if (R.cur) { release(R.cur); R.cur = null; }
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  const AC = typeof window !== 'undefined' ? (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (!md?.getUserMedia || !AC) throw new MicError('unsupported', '这个浏览器不支持录音（需要 HTTPS）');
  let stream: MediaStream;
  try { stream = await md.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
  catch (e) { const n = (e as DOMException).name; throw new MicError(n === 'NotAllowedError' || n === 'SecurityError' ? 'denied' : 'unsupported', n); }
  const ctx = new AC();
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  const src = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const s: S = { stream, ctx, node, src, chunks: [], t0: Date.now(), rate: ctx.sampleRate };
  node.onaudioprocess = e => {
    const d = e.inputBuffer.getChannelData(0); s.chunks.push(new Float32Array(d));
    let sq = 0; for (let i = 0; i < d.length; i += 4) sq += d[i] * d[i];
    onLevel(Math.min(1, Math.sqrt(sq / (d.length / 4)) * 6));
    if (Date.now() - s.t0 > MAX_REC_MS) node.onaudioprocess = null;
  };
  src.connect(node); node.connect(ctx.destination);
  R.cur = s;
}

export function useRecorder(): Recorder {
  return useMemo<Recorder>(() => ({
    start(onLevel) {
      const p = open(onLevel); starting = p.catch(() => {}); return p;
    },
    async stop() {
      if (starting) await starting;
      const s = R.cur; if (!s) throw new MicError('failed', 'not recording');
      const ms = Date.now() - s.t0; release(s); if (R.cur === s) R.cur = null;
      return { b64: bytesToB64(toWav16k(s.chunks, s.rate)), format: 'wav', rate: 16000, ms };
    },
    async cancel() { if (starting) await starting; if (R.cur) { release(R.cur); R.cur = null; } },
  }), []);
}
