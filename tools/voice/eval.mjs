/* 真实调用：qwen-flash 解析（文字）/ TTS → Fun-ASR → 解析（语音）。只从环境变量读 DASHSCOPE_API_KEY，不打印。
   node tools/voice/eval.mjs text|rules|audio */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { CASES as MAIN, HOLDOUT, CTX, judge } from './cases.mjs';
const HOLD = process.argv.includes('--holdout'); const CASES = HOLD ? HOLDOUT : MAIN;
import { ruleParse, hotwordContext } from '../../supabase/functions/_shared/voice-core.ts';
import { llmParse, transcribe } from '../../supabase/functions/_shared/dashscope.ts';
const mode = process.argv[2] || 'text';
const KEY = process.env.DASHSCOPE_API_KEY;
if (mode !== 'rules' && !KEY) { console.error('需要环境变量 DASHSCOPE_API_KEY'); process.exit(2); }
const FIX = new URL('./fixtures/', import.meta.url).pathname; mkdirSync(FIX, { recursive: true });

async function tts(text, i) {
  const f = `${FIX}case${String(i).padStart(2, '0')}.wav`;
  if (existsSync(f)) return f;
  const r = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'qwen3-tts-flash', input: { text, voice: 'Cherry', language_type: 'Chinese' } }) });
  const j = await r.json(); const url = j.output.audio.url.replace(/^http:/, 'https:');
  const raw = `${FIX}tmp.wav`; writeFileSync(raw, Buffer.from(await (await fetch(url)).arrayBuffer()));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-ar', '16000', '-ac', '1', '-sample_fmt', 's16', f]);
  return f;
}
const norm = s => s.replace(/[，。,.!?！？\s]/g, '');
let pass = 0, asrExact = 0; const rows = [];
for (const [i, c] of CASES.entries()) {
  let text = c.t, asr = '';
  const t0 = Date.now();
  if (mode === 'audio') {
    const f = await tts(c.t, HOLD ? 100 + i : i);
    const r = await transcribe(KEY, { b64: readFileSync(f).toString('base64'), format: 'wav', rate: 16000 }, hotwordContext(CTX.babyName));
    text = r.text; asr = r.engine; if (norm(text) === norm(c.t)) asrExact++;
  }
  const p = mode === 'rules' ? ruleParse(text, CTX) : await llmParse(KEY, text, CTX);
  const why = judge(c, p); if (!why) pass++;
  rows.push({ g: c.g, t: c.t, heard: mode === 'audio' ? text : undefined, ok: !why, why, engine: p.engine, ms: Date.now() - t0 });
  console.log(`${why ? 'FAIL' : 'PASS'} [${c.g}] ${c.t}${mode === 'audio' ? ` → 「${text}」` : ''}${why ? ` — ${why}` : ''} (${p.engine}, ${Date.now() - t0}ms)`);
}
const acc = (pass / CASES.length * 100).toFixed(1);
console.log(`\n${mode}: ${pass}/${CASES.length} = ${acc}%` + (mode === 'audio' ? ` · ASR 逐字一致 ${asrExact}/${CASES.length}` : ''));
writeFileSync(new URL(`./result-${mode}${HOLD ? '-holdout' : ''}.json`, import.meta.url), JSON.stringify({ mode, pass, total: CASES.length, acc: +acc, asrExact: mode === 'audio' ? asrExact : undefined, at: new Date().toISOString(), rows }, null, 1));
