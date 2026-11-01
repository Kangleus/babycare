/* 百炼（DashScope）调用：Fun-ASR 实时识别（WebSocket，带宝宝词上下文）→ 失败时退到 qwen3-asr-flash（HTTP）；
   qwen-flash 结构化解析（JSON 模式）→ 失败时退到本地规则。
   key 由调用方传入（Edge Function 从 Supabase secrets 读），这里不读环境变量、不打印 key、不保存音频。
   Deno（Edge Function）和 Node（本地测试脚本）都能直接跑。 */
import { buildMessages, extractJson, ruleParse, validateParse, type Ctx, type VoiceParse } from './voice-core.ts';

export type AudioFmt = 'wav' | 'pcm' | 'aac' | 'mp3' | 'opus' | 'amr';
export type AudioIn = { b64: string; format: AudioFmt; rate: number };
const BASE = 'https://dashscope.aliyuncs.com';
const WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';
const MIME: Record<AudioFmt, string> = { wav: 'audio/wav', pcm: 'audio/pcm', aac: 'audio/aac', mp3: 'audio/mpeg', opus: 'audio/ogg', amr: 'audio/amr' };

export function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64); const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Fun-ASR 实时识别：一次性把录好的音频按 100ms 一块推上去，收齐句子后返回整段文字 */
export function funAsr(key: string, audio: Uint8Array<ArrayBuffer>, format: AudioFmt, rate: number, context: string, timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const tid = crypto.randomUUID().replace(/-/g, '');
    const parts: string[] = []; let done = false;
    // Deno / Node(undici) 的 WebSocket 都支持在握手时带请求头
    const Ctor = WebSocket as unknown as new (u: string, o: unknown) => WebSocket;
    let ws: WebSocket;
    try { ws = new Ctor(WS_URL, { headers: { Authorization: `Bearer ${key}` } }); } catch (e) { reject(e); return; }
    const end = (err: Error | null) => { if (done) return; done = true; clearTimeout(timer); try { ws.close(); } catch { /* ignore */ } if (err) reject(err); else resolve(parts.join('')); };
    const timer = setTimeout(() => end(new Error('asr_timeout')), timeoutMs);
    ws.onopen = () => ws.send(JSON.stringify({
      header: { action: 'run-task', task_id: tid, streaming: 'duplex' },
      payload: { task_group: 'audio', task: 'asr', function: 'recognition', model: 'fun-asr-realtime',
        parameters: { format, sample_rate: rate, language_hints: ['zh'] },
        input: { context: [{ role: 'user', content: [{ type: 'input_text', text: context }] }] } },
    }));
    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data !== 'string') return;
      let m: { header: { event: string; error_code?: string; error_message?: string }; payload?: { output?: { sentence?: { text: string; sentence_end?: boolean } } } };
      try { m = JSON.parse(ev.data); } catch { return; }
      const e = m.header.event;
      if (e === 'task-started') {
        const step = Math.max(3200, Math.round(rate * 0.2)); // 约 100ms 的 16bit 单声道数据
        for (let i = 0; i < audio.length; i += step) ws.send(audio.subarray(i, i + step));
        ws.send(JSON.stringify({ header: { action: 'finish-task', task_id: tid, streaming: 'duplex' }, payload: { input: {} } }));
      } else if (e === 'result-generated') {
        const s = m.payload?.output?.sentence; if (s?.sentence_end && s.text) parts.push(s.text);
      } else if (e === 'task-finished') end(null);
      else if (e === 'task-failed') end(new Error(`asr_failed:${m.header.error_code ?? ''}`));
    };
    ws.onerror = () => end(new Error('asr_ws_error'));
    ws.onclose = () => end(parts.length ? null : new Error('asr_closed'));
  });
}

/** 备用：qwen3-asr-flash（HTTP，OpenAI 兼容），上下文同样放宝宝词 */
export async function qwenAsr(key: string, a: AudioIn, context: string, timeoutMs = 15000): Promise<string> {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}/compatible-mode/v1/chat/completions`, {
      method: 'POST', signal: ac.signal, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen3-asr-flash', messages: [
        { role: 'system', content: [{ type: 'text', text: context }] },
        { role: 'user', content: [{ type: 'input_audio', input_audio: { data: `data:${MIME[a.format]};base64,${a.b64}` } }] }],
        asr_options: { language: 'zh', enable_itn: true } }),
    });
    if (!r.ok) throw new Error(`asr_http_${r.status}`);
    const j = await r.json() as { choices?: { message?: { content?: string } }[] };
    return (j.choices?.[0]?.message?.content ?? '').trim();
  } finally { clearTimeout(t); }
}

export async function transcribe(key: string, a: AudioIn, context: string): Promise<{ text: string; engine: string }> {
  try {
    const text = (await funAsr(key, b64ToBytes(a.b64), a.format, a.rate, context)).trim();
    if (text) return { text, engine: 'fun-asr-realtime' };
  } catch (_e) { /* 退到备用 */ }
  if (a.format === 'pcm') return { text: '', engine: 'fun-asr-realtime' };
  return { text: await qwenAsr(key, a, context), engine: 'qwen3-asr-flash' };
}

/** qwen-flash 结构化解析；任何失败都退到本地规则（engine = 'rules'） */
export async function llmParse(key: string, text: string, ctx: Ctx, model = 'qwen-flash', timeoutMs = 12000): Promise<VoiceParse> {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}/compatible-mode/v1/chat/completions`, {
      method: 'POST', signal: ac.signal, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: buildMessages(text, ctx), response_format: { type: 'json_object' }, temperature: 0, max_tokens: 700, enable_thinking: false }),
    });
    if (!r.ok) throw new Error(`llm_http_${r.status}`);
    const j = await r.json() as { choices?: { message?: { content?: string } }[] };
    const raw = extractJson(j.choices?.[0]?.message?.content ?? '');
    if (!raw) throw new Error('llm_bad_json');
    return validateParse(raw, text, ctx, 'llm');
  } catch (_e) {
    return ruleParse(text, ctx);
  } finally { clearTimeout(t); }
}
