/* 问团子评测。
   node tools/ask/eval.mjs rules      # 免费、离线：20 条的规则档位 + 12 条 postCheck 单元用例
   node tools/ask/eval.mjs live       # 真实调用百炼（需要 DASHSCOPE_API_KEY）
   node tools/ask/eval.mjs live --only 7,12
   判定口径见 docs/M5-ASK-AGENT.md §14。结果写 tools/ask/result-{mode}.json。 */
import { writeFileSync } from 'node:fs';
import { CASES, CTX, POSTCHECK, TEMPS, judgeTier } from './cases.mjs';
import { ruleTier, postCheck, extractTemps } from '../../supabase/functions/_shared/ask-core.ts';

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
  console.log('live 模式在 ask-agent 完成后实现（第 3 步）');
  process.exit(2);
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
