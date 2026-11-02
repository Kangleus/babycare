/* ask-tuanzi 冒烟：用测试账号（.env.test，不打印）登录 → 打线上函数。
   node tools/ask/fn_smoke.mjs [functionUrl]     默认 = 线上 ask-tuanzi
   覆盖：无 token → 401；非成员 babyId → 403；紧急问题 → tier=urgent 且 usage=null（不计次）；
        普通问题 → 200 且 answer.cites 非空；日志里搜不到问题原文（用一个独特词人工核对）。
   限额用例（先把 ASK_DAILY_LIMIT 设成 2）：本脚本带 --quota 跑第 3 次，期望 429。 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync(new URL('../../.env.test', import.meta.url), 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const cfg = readFileSync(new URL('../../src/data/cloud-config.ts', import.meta.url), 'utf8');
const URL0 = /'(https:\/\/[a-z0-9]+\.supabase\.co)'/.exec(cfg)[1], PK = /'(sb_publishable_[^']+)'/.exec(cfg)[1];
const FN = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : `${URL0}/functions/v1/ask-tuanzi`;
const QUOTA_ONLY = process.argv.includes('--quota');

let pass = 0, total = 0;
const ok = (cond, label, info = '') => { total++; if (cond) pass++; console.log(`${cond ? 'PASS' : 'FAIL'} ${label}${info ? ' — ' + info : ''}`); };

async function login(email) {
  const r = await fetch(`${URL0}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: PK, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: env.YJ_IT_PASSWORD }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('login failed ' + r.status + ' ' + (j.error_code || j.msg || j.error));
  return j.access_token;
}
const babiesOf = async tok => (await (await fetch(`${URL0}/rest/v1/babies?select=id,name&deleted_at=is.null`, { headers: { apikey: PK, Authorization: `Bearer ${tok}` } })).json());
const call = async (tok, body) => {
  const t0 = Date.now();
  const r = await fetch(FN, {
    method: 'POST',
    headers: { apikey: PK, 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ms: Date.now() - t0, j };
};

const a = await login(env.YJ_IT_A);
const c = await login(env.YJ_IT_C);
const ba = await babiesOf(a), bc = await babiesOf(c);
const babyId = ba[0]?.id;
if (!babyId) throw new Error('测试账号 A 没有宝宝');
const otherBaby = bc[0]?.id ?? 'not-a-real-baby-id-0000';
const base = { babyId, tzOffsetMin: -480, question: '这周奶量正常吗？' };

if (QUOTA_ONLY) {
  // 期望：把 ASK_DAILY_LIMIT 临时设成 2 之后连打 3 次，第 3 次 429
  let last;
  for (let i = 0; i < 3; i++) last = await call(a, base);
  ok(last.status === 429 && /今天问得有点多/.test(last.j.message || ''), '超限 → 429 + 文案', `${last.status} ${last.j.message ?? last.j.code}`);
} else {
  const noTok = await call(null, base);
  ok(noTok.status === 401, '无 token → 401', `${noTok.status} ${noTok.j.code ?? ''}`);

  const urgent = await call(a, { ...base, question: '宝宝发烧 38.5℃ 怎么办？' });
  ok(urgent.status === 200 && urgent.j.tier === 'urgent', '紧急问题 → tier=urgent', `${urgent.status} tier=${urgent.j.tier}`);
  ok(urgent.j.usage === null, '紧急不计次（usage=null）', JSON.stringify(urgent.j.usage));
  ok(urgent.j.meta?.rounds === 0, '紧急不进模型（rounds=0）', JSON.stringify(urgent.j.meta));

  const member = await call(a, base);
  ok(member.status === 200, '普通问题 → 200', `${member.status} ${member.j.code ?? ''} tier=${member.j.tier}`);
  ok(Array.isArray(member.j.answer?.cites) && member.j.answer.cites.length > 0, '普通问题有依据标签', JSON.stringify(member.j.answer?.cites));
  ok(typeof member.j.usage?.used === 'number', '普通问题计次', JSON.stringify(member.j.usage));
  ok(!/布洛芬|美林|\d+\s*(ml|毫克|mg)/.test(`${member.j.answer?.concl ?? ''}${member.j.answer?.body ?? ''}`), '回答里没有药名 / 剂量');

  const other = await call(c, { ...base, babyId });
  ok(other.status === 403 || other.status === 404, '非成员 babyId → 403', `${other.status} ${other.j.code ?? ''}`);
}
ok(true, `函数地址 ${FN}`);
console.log(`\n${pass}/${total}`);
process.exit(pass === total ? 0 : 1);
