/* 问团子的确定性测试数据：宝宝「豆米」，男，2026-03-28 出生，奶粉喂养。
   「现在」固定 2026-11-02 10:05（北京时间）。规则刻意做得很规律，方便手算期望值：
   - 每天 6 顿奶：07:00(150) 10:00(140) 13:00(130) 16:00(160) 19:00(120) 22:00(150) → 850ml
   - 夜间 22:30–01:30（180 分）+ 02:00–06:30（270 分）→ 两段，夜醒 1 次，最长 270 分
   - 白天 3 段小觉：09:00–10:00、13:00–14:00、17:00–17:40（共 160 分）
   - 每天 8 次尿布，其中 2 次带便便
   - 11/01 20:10 体温 37.6℃（腋温）；10/30 09:10 用药「维生素 D」1 次；10/20 身高体重 62cm 7.1kg
   照日历算，每个完整天的睡眠都是 90（自己那段跨零点）+ 90+270（前一夜留在今天） + 160（小觉）
   = 610 分钟 = 10.2 小时。 */

export const NOW_MS = Date.parse('2026-11-02T10:05:00+08:00');
export const TZ = -480; // 北京时间
export const BABY = { name: '豆米', gender: 'boy', birthday: '2026-03-28', feeding: 'formula' };

const pad = (n) => String(n).padStart(2, '0');
const iso = (day, h, m = 0) => `${day}T${pad(h)}:${pad(m)}:00+08:00`;
const addDays = (day, n) => {
  const [y, mo, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

const FEEDS = [[7, 150], [10, 140], [13, 130], [16, 160], [19, 120], [22, 150]];
const DIAPERS = [[8, 'pee'], [10, 'poop'], [12, 'pee'], [14, 'pee'], [16, 'both'], [19, 'pee'], [21, 'pee'], [23, 'pee']];

export function makeRecords() {
  const rows = [];
  for (let i = -16; i <= 0; i++) {
    const day = addDays('2026-11-02', i);
    const put = (type, h, m, vals, end = null) => {
      const t = Date.parse(iso(day, h, m));
      if (t > NOW_MS) return; // 今天只保留「现在」之前的记录
      rows.push({ type, started_at: iso(day, h, m), ended_at: end, vals, note: null, created_by_name: '妈妈' });
    };
    for (const [h, ml] of FEEDS) put('feed', h, 0, { sub: 'formula', ml });
    for (const [h, sub] of DIAPERS) put('diaper', h, 0, { sub });
    put('sleep', 9, 0, {}, iso(day, 10, 0));
    put('sleep', 13, 0, {}, iso(day, 14, 0));
    put('sleep', 17, 0, {}, iso(day, 17, 40));
    // 夜间第一段：当天 22:30 → 次日 01:30
    put('sleep', 22, 30, {}, iso(addDays(day, 1), 1, 30));
  }
  // 夜间第二段单独补：每天 02:00–06:30（跨在「今天」这一侧，归到当天）
  for (let i = -16; i <= 0; i++) {
    const day = addDays('2026-11-02', i);
    const t = Date.parse(iso(day, 2, 0));
    if (t > NOW_MS) continue;
    rows.push({ type: 'sleep', started_at: iso(day, 2, 0), ended_at: iso(day, 6, 30), vals: {}, note: null, created_by_name: '妈妈' });
  }
  rows.push({ type: 'temp', started_at: iso('2026-11-01', 20, 10), ended_at: null, vals: { v: 37.6, site: '腋温' }, note: null, created_by_name: '妈妈' });
  rows.push({ type: 'med', started_at: iso('2026-10-30', 9, 10), ended_at: null, vals: { name: '维生素 D', times: 1 }, note: '医生说每天一次（家长备注）', created_by_name: '妈妈' });
  // 一条不规则记录（10/20 凌晨 3 点的小觉）：用来验证时区确实影响「分到哪一天」
  rows.push({ type: 'sleep', started_at: iso('2026-10-20', 3, 0), ended_at: iso('2026-10-20', 4, 0), vals: {}, note: null, created_by_name: '爸爸' });
  rows.push({ type: 'growth', started_at: iso('2026-10-20', 9, 0), ended_at: null, vals: { cm: 62, kg: 7.1 }, note: null, created_by_name: '爸爸' });
  return rows.sort((a, b) => a.started_at.localeCompare(b.started_at));
}

export const RECORDS = makeRecords();
