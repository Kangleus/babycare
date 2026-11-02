/* ask-stats 的手算单测：用 fixture 的规律数据验证口径。
   node tools/ask/stats_test.mjs
   手算依据：每个完整天睡眠 = 90（自己 22:30 那段跨零点）+ 90 + 270（前一夜留在今天）+ 160（三段小觉）
   = 610 分 = 10.2 小时；每天 6 顿共 850ml；8 次尿布含 2 次便便；夜醒 1 次。 */
import { RECORDS, NOW_MS, TZ } from './fixture.mjs';
import { computeStats, queryEvents } from '../../supabase/functions/_shared/ask-stats.ts';

let pass = 0, total = 0;
function eq(label, got, want) {
  total++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ` — got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
}

/* 1. 睡眠：日均、窗口、每天、今天到 10:05、上一段 */
const sleep7 = computeStats(RECORDS, 'sleep', 7, TZ, NOW_MS);
eq('sleep 7d avg', sleep7.avg, 10.2);
eq('sleep 7d 天数', sleep7.per_day.length, 7);
eq('sleep 7d 每天都是 10.2', sleep7.per_day.every(d => d.value === 10.2), true);
eq('sleep 7d 最后一个是昨天 11/01', sleep7.per_day[6].date, '11/01');
eq('sleep 7d 窗口文案', sleep7.window, '10/26–11/01（7 个完整天，不含今天）');
eq('sleep 7d 今天到 10:05 = 7 小时', sleep7.today_so_far, { value: 7, until: '10:05' });
// 上一段（10/19–10/25）里有 10/20 那条不规则小觉，所以比 10.2 高一点
 eq('sleep 7d 上一段 avg', sleep7.previous.avg, 10.3);
eq('sleep 7d delta', sleep7.delta, -0.1);
eq('sleep 7d 不含今天', sleep7.per_day.some(d => d.date === '11/02'), false);

/* 2. 奶量：日均 + extra */
const feed7 = computeStats(RECORDS, 'feed', 7, TZ, NOW_MS);
eq('feed 7d avg', feed7.avg, 850);
eq('feed 7d 次/天', feed7.extra.feeds_per_day, 6);
eq('feed 7d 单次中位数', feed7.extra.median_ml_per_feed, 145);
eq('feed 7d 间隔中位数（3h，夜间长间隔不算）', feed7.extra.median_gap_min, 180);
eq('feed 今天到现在 290ml', feed7.today_so_far, { value: 290, until: '10:05' });

/* 3. 尿布 / 便便 */
eq('diaper 1d avg', computeStats(RECORDS, 'diaper', 1, TZ, NOW_MS).avg, 8);
eq('poop 1d avg', computeStats(RECORDS, 'poop', 1, TZ, NOW_MS).avg, 2);

/* 4. 体温：测量值不补 0 */
const temp7 = computeStats(RECORDS, 'temp', 7, TZ, NOW_MS);
eq('temp 7d avg（只有 1 天有记录）', temp7.avg, 37.6);
eq('temp 7d extra.max', temp7.extra.max, 37.6);
eq('temp 7d latest', temp7.extra.latest, { value: 37.6, time: '20:10', flag: '偏高' });
eq('temp 7d 没测的天是 null', temp7.per_day.filter(d => d.value === null).length, 6);
eq('temp 7d data_note 提示补 0 规则', /6 天没有体温记录/.test(temp7.data_note || ''), true);

/* 5. 夜醒 */
eq('night_wakes 1d', computeStats(RECORDS, 'night_wakes', 1, TZ, NOW_MS).avg, 1);

/* 6. 时区必须影响结果（tz=0 等于把日界线挪了 8 小时） */
// 规则数据是 24h 周期的，日均不受日界线影响；用 10/20 那条不规则小觉验证「分到哪一天」会变
const sleep30a = computeStats(RECORDS, 'sleep', 30, TZ, NOW_MS);
const sleep30b = computeStats(RECORDS, 'sleep', 30, 0, NOW_MS);
eq('tz 不同 → 每天的分桶不同', JSON.stringify(sleep30a.per_day.map(d => d.value)) !== JSON.stringify(sleep30b.per_day.map(d => d.value)), true);

/* 7. 成长：测量值，窗口外就没有 */
const growth30 = computeStats(RECORDS, 'growth', 30, TZ, NOW_MS);
eq('growth 30d avg（10/20 那次）', growth30.avg, 7.1);
eq('growth 30d latest', growth30.extra.latest, { kg: 7.1, cm: 62, date: '10/20' });

/* 8. 没有记录的天按 0 计 + data_note */
const water7 = computeStats(RECORDS, 'water', 7, TZ, NOW_MS);
eq('water 7d avg = 0', water7.avg, 0);
eq('water 7d data_note 说明按 0 计', /没有喝水记录，按 0 计/.test(water7.data_note || ''), true);

/* 9. query_events：昨晚窗口、夜醒、最长一段 */
const night = queryEvents(RECORDS, 'sleep', 'last_night', TZ, NOW_MS);
eq('last_night 睡眠段数', night.count, 2);
eq('last_night 夜醒', night.extra.night_wakes, 1);
eq('last_night 最长一段 270 分', night.extra.longest_sleep_min, 270);
eq('last_night 标签含「昨晚」', /^昨晚/.test(night.range_label), true);

/* 10. query_events：指定日期 / 今天 */
eq('10/31 喂奶 6 条', queryEvents(RECORDS, 'feed', 'date', TZ, NOW_MS, 30, '2026-10-31').count, 6);
eq('今天的喂奶 2 条（07:00 / 10:00）', queryEvents(RECORDS, 'feed', 'today', TZ, NOW_MS).count, 2);
eq('用药文案不带剂量', queryEvents(RECORDS, 'med', 'last_7d', TZ, NOW_MS).events[0].text, '用药「维生素 D」1 次（家长记录）');

console.log(`\n${pass}/${total} = ${((pass / total) * 100).toFixed(1)}%`);
process.exit(pass === total ? 0 : 1);
