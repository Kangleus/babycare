/* voice-parse 冒烟：用测试账号（.env.test，不打印）登录 → 调函数（文字 / 音频 / 非成员 / 未登录）。
   node tools/voice/fn_smoke.mjs [functionUrl]   默认 = 线上 voice-parse */
import { readFileSync, existsSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../../.env.test', import.meta.url), 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const cfg = readFileSync(new URL('../../src/data/cloud-config.ts', import.meta.url), 'utf8');
const URL0 = /'(https:\/\/[a-z0-9]+\.supabase\.co)'/.exec(cfg)[1], PK = /'(sb_publishable_[^']+)'/.exec(cfg)[1];
const FN = process.argv[2] || `${URL0}/functions/v1/voice-parse`;
async function login(email) {
  const r = await fetch(`${URL0}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: PK, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: env.YJ_IT_PASSWORD }) });
  const j = await r.json(); if (!j.access_token) throw new Error('login failed ' + r.status + ' ' + (j.error_code || j.msg || j.error)); return j.access_token;
}
const babiesOf = async tok => (await (await fetch(`${URL0}/rest/v1/babies?select=id,name&deleted_at=is.null`, { headers: { apikey: PK, Authorization: `Bearer ${tok}` } })).json());
const call = async (tok, body) => { const t0 = Date.now(); const r = await fetch(FN, { method: 'POST', headers: { apikey: PK, 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); return { status: r.status, ms: Date.now() - t0, j }; };
const sum = r => `${r.status} ${r.j.ok ? `ok text=「${r.j.text}」 action=${r.j.parse.action} events=${r.j.parse.events.map(e => e.type + (e.values.ml ? ':' + e.values.ml : '')).join(',')} engine=${r.j.parse.engine} asr=${r.j.asr} usage=${r.j.usage?.used}/${r.j.usage?.limit}` : `code=${r.j.code ?? r.j.msg ?? r.j.message}`} (${r.ms}ms)`;

const a = await login(env.YJ_IT_A), c = await login(env.YJ_IT_C);
const ba = await babiesOf(a), bc = await babiesOf(c);
let babyId = ba[0]?.id;
if (!babyId) { /* 先给 A 建一个测试家庭 + 宝宝 */
  const H = { apikey: PK, Authorization: `Bearer ${a}`, 'Content-Type': 'application/json' };
  const fam = await (await fetch(`${URL0}/rest/v1/rpc/create_family`, { method: 'POST', headers: H, body: JSON.stringify({ p_name: '语音测试之家', p_display_name: '妈妈' }) })).json();
  babyId = 'vt' + Date.now().toString(36) + '-baby';
  const r = await fetch(`${URL0}/rest/v1/babies`, { method: 'POST', headers: H, body: JSON.stringify({ id: babyId, family_id: fam, name: '豆米', birthday: '2026-03-28', gender: 'girl', avatar: 'baby', feeding: 'formula' }) });
  console.log('建测试家庭/宝宝', r.status);
}
console.log('未登录         ', sum(await call(null, { babyId, text: '十点喝了120毫升奶' })));
console.log('非本家庭成员   ', sum(await call(c, { babyId: bc.some(b => b.id === babyId) ? 'nope' : babyId, text: '十点喝了120毫升奶' })));
console.log('文字           ', sum(await call(a, { babyId, text: '十点喝了120毫升奶，拉了一次', tzOffsetMin: -480 })));
const wav = new URL('./fixtures/case00.wav', import.meta.url);
if (existsSync(wav)) console.log('语音(wav)      ', sum(await call(a, { babyId, tzOffsetMin: -480, audio: { b64: readFileSync(wav).toString('base64'), format: 'wav', rate: 16000 } })));
