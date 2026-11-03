/* 生成测试用的固定数据（豆米的 14 天演示记录 + 健康档案），供 Playwright 注入 localStorage。
   做法：把 seed.ts 依赖的几个纯模块复制到临时目录、把 `@/lib/` 改成相对路径，再用 Node 的类型剥离直接跑——
   避免手写一份「和 buildDemo 不一样」的假数据（那样测试就测不到真东西了）。

   用法：node tools/fixtures/gen_demo.mjs   → 写 tools/fixtures/demo.json
   注意：冻结时间必须和 e2e 里 clock.set_system_time 的一致（2026-10-31 10:20 +08:00）。 */
import { mkdtempSync, cpSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const NOW = new Date('2026-10-31T10:20:00+08:00');
const BABY_ID = 'baby-e2e';

const FILES = [
  ['src/data/seed.ts', 'seed.ts'],
  ['src/lib/health.ts', 'health.ts'],
  ['src/lib/calc.ts', 'calc.ts'],
  ['src/lib/time.ts', 'time.ts'],
  ['src/data/types.ts', 'types.ts'],
];

const dir = mkdtempSync(join(tmpdir(), 'demo-'));
for (const [from, to] of FILES) {
  let src = readFileSync(join(ROOT, from), 'utf8');
  src = src.replace(/@\/lib\//g, './').replace(/@\/data\/types/g, './types').replace(/from '\.\/(\w+)'/g, "from './$1.ts'");
  writeFileSync(join(dir, to), src);
}

const { buildDemo, buildDemoHealth } = await import(pathToFileURL(join(dir, 'seed.ts')).href);
const baby = { id: BABY_ID, name: '豆米', birthday: '2026-03-28', gender: 'girl', avatar: 'baby', feeding: 'formula' };
const records = buildDemo(BABY_ID, NOW).map(r => ({ ...r, babyId: BABY_ID }));
const health = buildDemoHealth(baby, NOW);

const out = join(ROOT, 'tools', 'fixtures', 'demo.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ now: NOW.toISOString(), baby, records, health }, null, 1));

console.log(`记录 ${records.length} 条 · 病程 ${health.episodes.length} · 过敏 ${health.allergies.length} · 疫苗 ${health.vaccines.length} · 提醒 ${health.reminders.length}`);
console.log('写出', out);
