/* 问团子评测。
   node tools/ask/eval.mjs rules      # 免费、离线：20 条的规则档位 + 12 条 postCheck 单元用例
   node tools/ask/eval.mjs live       # 真实调用百炼（需要 DASHSCOPE_API_KEY）
   node tools/ask/eval.mjs live --only 7,12
   判定口径见 docs/M5-ASK-AGENT.md §14。结果写 tools/ask/result-{mode}.json。 */
import { writeFileSync } from 'node:fs';
import { CASES, CTX, POSTCHECK, TEMPS, BABY, judgeTier, judgeText } from './cases.mjs';
import { ruleTier, postCheck, extractTemps, urgentCard } from '../../supabase/functions/_shared/ask-core.ts';
import { computeStats, queryEvents } from '../../supabase/functions/_shared/ask-stats.ts';
import { answerQuestion } from '../../supabase/functions/_shared/ask-agent.ts';
import { ageText } from '../../src/lib/time.ts';
import { RECORDS, NOW_MS, TZ } from './fixture.mjs';

const mode = process.argv[2] || 'rules';
const onlyArg = process.argv.find(a => a.startsWith('--only'));
const ONLY = onlyArg ? new Set((process.argv[process.argv.indexOf(onlyArg) + 1] || '').split(',').map(Number)) : null;
const rows = [];
let pass = 0;

function row(ok, label, reason = '') {
  rows.push({ ok, label, reason });
  if (ok) pass++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${reason ? ' — ' + reason : ''}`);
}

/* ---------- rules ---------- */
if (mode === 'rules') {
  for (const c of CASES) {
    const got = ruleTier(c.q, c.ctx ?? CTX);
    const ok = judgeTier(c, got);
    // why 里只有 urgent 用例写的是「必须命中的规则名」；7–15 的 why 只是风险标签
    const reasonsOk = c.tier[0] !== 'urgent' || !c.why || c.why.every(w => got.reasons.includes(w));
    row(ok && reasonsOk, `[${c.cat}] #${c.id} ${c.q}`, `tier=${got.tier} reasons=${got.reasons.join(',')}${ok ? '' : ' 期望 ' + c.tier}`);
  }
  for (const c of TEMPS) {
    const got = extractTemps(c.text).join(',');
    row(got === c.want.join(','), `[体温抽取] ${c.text}`, `got=${got || '无'} 期望=${c.want.join(',') || '无'}`);
  }
  for (const p of POSTCHECK) {
    const out = postCheck({ concl: '', body: p.body }, p.tools ?? []);
    const codes = [...new Set(out.violations.map(v => v.code))].sort().join(',');
    const want = [...new Set(p.codes)].sort().join(',');
    const codesOk = codes === want;
    const patchOk = !p.patchedHas || p.patchedHas.test(out.patched);
    row(codesOk && patchOk, `[postCheck] ${p.id} ${p.body}`, `got=${codes || '无违规'} 期望=${want || '无违规'}${patchOk ? '' : ' 补字不对: ' + out.patched}`);
  }
} else if (mode === 'live') {
  const KEY = process.env.DASHSCOPE_API_KEY;
  if (!KEY) { console.error('需要环境变量 DASHSCOPE_API_KEY'); process.exit(2); }
  const ONCE = process.argv.includes('--once');
  const today = new Date(NOW_MS);

  /* 评测用的 DataSource：固定 fixture，只读 */
  const DS = {
    async baby() { return BABY; },
    async records(from, to) {
      const a = Date.parse(from), b = Date.parse(to);
      return RECORDS.filter(r => { const t = Date.parse(r.started_at); return t >= a && t <= b; });
    },
    async health() {
      return {
        allergies: [],
        episodes: [{ title: '幼儿急疹', start_date: '2026-10-12', end_date: '2026-10-17', status: 'recovered' }],
        vaccines: [{ name: '流感 第 1 剂', given_on: '2026-10-06' }],
        reminders: [{ cat: 'vax', title: '流感 第 2 剂', due_at: '2026-11-03T09:00:00+08:00', repeat: 'none', done_at: null }],
      };
    },
  };

  /* {stat:x} 占位符 → 用代码算出来的真实数值 */
  const sleep7 = computeStats(RECORDS, 'sleep', 7, TZ, NOW_MS);
  const feed7 = computeStats(RECORDS, 'feed', 7, TZ, NOW_MS);
  const lastNight = queryEvents(RECORDS, 'sleep', 'last_night', TZ, NOW_MS).extra?.night_wakes ?? 0;
  const STATS = { sleep7avg: String(sleep7.avg), feed7avg: String(feed7.avg), nightWakesLastNight: String(lastNight) };

  const fill = t => String(t).replace(/\{stat:(\w+)\}/g, (_, k) => STATS[k] ?? '?');
  const cases = CASES.filter(c => !ONLY || ONLY.has(c.id));
  let cost = 0, tokensIn = 0, tokensOut = 0;
  const times = [];
  for (const c of cases) {
    const ctx = c.ctx ?? CTX;
    const attempts = ONCE ? 1 : 2;
    let ok = false, last = '';
    for (let a = 0; a < attempts && !ok; a++) {
      const r = await answerQuestion({
        key: KEY, ds: DS, question: c.q, tz: TZ, nowMs: NOW_MS,
        ageDays: ctx.ageDays, ageText: ageText(BABY.birthday, today, false),
        latestTemp: ctx.latestTemp,
      });
      const answer = r.answer;
      const card = r.tier === 'urgent' ? urgentCard(r.urgent?.reasons ?? [], RECORDS, today, BABY.name) : null;
      const text = [answer?.concl, answer?.body, answer?.footer, card?.title, ...(card?.items ?? []), card?.line, ...(card?.recent ?? []).map(x => x.k + x.v)]
        .filter(Boolean).join('\n').replace(/\*\*/g, '');
      const reasons = [];
      if (!c.tier.includes(r.tier)) reasons.push(`档位 ${r.tier} 不在 ${c.tier.join('/')}`);
      if (c.tier[0] === 'urgent' && r.meta.rounds !== 0) reasons.push(`紧急却调了模型 rounds=${r.meta.rounds}`);
      reasons.push(...judgeText({ ...c, must: (c.must ?? []).map(x => typeof x === 'string' ? fill(x) : x) }, text));
      if (!reasons.length) ok = true;
      last = reasons.join('；') || 'ok';
      const u = r.meta.usage;
      tokensIn += u.in; tokensOut += u.out;
      // 全部按 qwen-plus 的价（¥0.8 / ¥2 每百万 token）估，是上限；分类用的 qwen-flash 更便宜
      cost += (u.in / 1e6) * 0.8 + (u.out / 1e6) * 2;
      times.push(r.meta.ms);
    }
    row(ok, `[${c.cat}] #${c.id} ${c.q}`, ok ? last : last + (ONCE ? '' : '（两次都没过）'));
  }
  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)] ?? 0, p90 = times[Math.floor(times.length * 0.9)] ?? 0;
  console.log(`\np50 ${p50}ms · p90 ${p90}ms · token in/out ${tokensIn}/${tokensOut} · 估算花费 ¥${cost.toFixed(3)}`);
} else {
  console.error('用法：node tools/ask/eval.mjs rules|live [--only 7,12]');
  process.exit(2);
}

const total = rows.length;
const acc = pass / total;
console.log(`\n${pass}/${total} = ${(acc * 100).toFixed(1)}%`);
writeFileSync(new URL(`./result-${mode}.json`, import.meta.url),
  JSON.stringify({ mode, pass, total, acc: +acc.toFixed(3), at: new Date().toISOString(), rows }, null, 1));
process.exit(pass === total ? 0 : 1);
