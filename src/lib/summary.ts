/* 一键摘要的纯计算：数字全部由代码算，句子由模板拼。不调用 AI、不发网络请求。
   窗口语义与原型一致：近 N 天 = 今天 + 前面 N-1 个整天（原型 rng=3 → 10/29–10/31）。
   日均沿用趋势页规则：只统计「完整的天」（不含今天）；没有记录的天按 0 计。
   医疗措辞沿用 doctor.tsx 的安全文案：只陈述家长记录，不做判断、不给剂量。 */
import type { Baby, BabyRecord, HealthData } from '@/data/types';
import type { IconName } from '@/lib/art';
import { addDays, ageText, md, minOf, parseYmd, startOfDay } from './time';
import { dayEvs, feedGap, fmt, predict, totals } from './calc';
import { activeEpisode, epRange, episodeDays, upcoming, whenText } from './health';

export type Aud = 'doctor' | 'granny';
export type MemoRow = { ic: IconName; bg: string; k: string; d: string[] };
export type Memo = { title: string; sub: string; rows: MemoRow[]; foot: string; big: boolean; empty: boolean };

export const RANGES = [1, 3, 7] as const;

const R1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const INT = (v: number) => String(Math.round(v));

export type Stats = {
  n: number;
  days: Date[]; today: Date; rng: string;
  count: number;          // 窗口内记录条数（0 = 空状态）
  fullDays: number;       // 参与日均计算的完整天数
  feeds: number; ml: number; feedMls: number[];
  feedPerDay: number | null; mlPerDay: number | null; mlPerFeed: number | null;
  sleepPerDay: number | null; diaperPerDay: number | null; poopDays: number;
  todayMl: number; todayFeeds: number; todaySleepH: number; todayDia: number; todayPoop: boolean; waterMl: number;
  temps: { at: Date; v: number; site?: string }[];
  meds: BabyRecord[]; syms: BabyRecord[];
  nextFeed: number;       // 下一顿（当天第 N 分钟）
  feedEveryMin: number;   // 喂奶平均间隔
};

/** 统计窗口内的记录。所有下游文案都从这里取数。 */
export function summaryStats(records: BabyRecord[], now: Date, n: number): Stats {
  const today = startOfDay(now);
  const days = Array.from({ length: n }, (_, i) => addDays(today, -(n - 1 - i)));
  const from = days[0].getTime();
  const win = records.filter(r => { const t = +new Date(r.time); return t >= from && t <= +now; });
  const full = days.filter(d => d.getTime() !== today.getTime());

  let slMin = 0, dia = 0, feedCnt = 0, ml = 0, poopDays = 0;
  for (const d of full) {
    const evs = dayEvs(records, d), T = totals(evs, 1440);
    slMin += T.sl; dia += T.dia; feedCnt += T.feeds; ml += T.ml;
    if (evs.some(e => e.type === 'diaper' && e.sub !== 'pee')) poopDays++;
  }
  const tEvs = dayEvs(records, today), Tt = totals(tEvs, minOf(now));

  const feedMls = win.filter(r => r.type === 'feed' && (r.values.ml ?? 0) > 0).map(r => r.values.ml!).sort((a, b) => a - b);
  const median = feedMls.length ? feedMls[Math.floor(feedMls.length / 2)] : null;
  const { gap } = feedGap(records, now);
  const p = predict(records, tEvs, now);

  return {
    n, days, today,
    rng: n === 1 ? md(today) : `${md(days[0])}–${md(today)}`,
    count: win.length,
    fullDays: full.length,
    feeds: feedCnt, ml, feedMls,
    feedPerDay: full.length ? feedCnt / full.length : null,
    mlPerDay: full.length ? ml / full.length : null,
    mlPerFeed: median,
    sleepPerDay: full.length ? slMin / 60 / full.length : null,
    diaperPerDay: full.length ? dia / full.length : null,
    poopDays,
    todayMl: Tt.ml, todayFeeds: Tt.feeds, todaySleepH: Tt.sl / 60,
    todayDia: Tt.dia, todayPoop: tEvs.some(e => e.type === 'diaper' && e.sub !== 'pee'),
    waterMl: win.filter(r => r.type === 'water').reduce((a, r) => a + (r.values.ml ?? 0), 0),
    temps: win.filter(r => r.type === 'temp' && r.values.v).map(r => ({ at: new Date(r.time), v: r.values.v!, site: r.values.site })).sort((a, b) => +a.at - +b.at),
    meds: win.filter(r => r.type === 'med').sort((a, b) => +new Date(a.time) - +new Date(b.time)),
    syms: win.filter(r => r.type === 'symptom').sort((a, b) => +new Date(a.time) - +new Date(b.time)),
    nextFeed: p.next, feedEveryMin: gap,
  };
}

const FEEDN: Record<Baby['feeding'], string> = { formula: '奶粉', bm: '瓶喂母乳', breast: '亲喂' };
const dayAt = (d: Date, now: Date) => `${startOfDay(d).getTime() === startOfDay(now).getTime() ? '今天' : md(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** 按「给医生 / 给奶奶」生成便签。数据不足时宁可少写一行，也不编。 */
export function buildSummary(aud: Aud, st: Stats, ctx: { baby: Baby; health: HealthData; now: Date; me: string }): Memo {
  const { baby, health, now, me } = ctx;
  const sex = baby.gender === 'girl' ? '女' : baby.gender === 'boy' ? '男' : '';
  const meta = [st.rng, sex, ageText(baby.birthday, now, false), FEEDN[baby.feeding]].filter(Boolean).join(' · ');

  if (!st.count) {
    return {
      title: `${baby.name} · 近 ${st.n} 天记录摘要`,
      sub: `${meta} · ${aud === 'doctor' ? '给医生看' : '给家里人看'}`,
      rows: [{ ic: 'doc', bg: '#FFD45C', k: '还没有记录', d: [`近 ${st.n} 天还没有${baby.name}的记录`, '先记一笔，摘要就有内容了'] }],
      foot: '「团子育儿本」据家长记录整理 · 不含诊断 · 仅供参考',
      big: aud === 'granny', empty: true,
    };
  }

  if (aud === 'doctor') {
    const rows: MemoRow[] = [];
    /* 喂养 */
    const feedD = st.fullDays && st.mlPerDay !== null
      ? `日均 ${INT(st.mlPerDay)} ml，${R1(st.feedPerDay ?? 0)} 次/天${st.mlPerFeed ? `，单次约 ${INT(st.mlPerFeed)} ml` : ''}；今天到 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} 已喝奶 ${INT(st.todayMl)} ml（${st.todayFeeds} 次）`
      : `今天到 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} 已喝奶 ${INT(st.todayMl)} ml（${st.todayFeeds} 次）`;
    rows.push({ ic: 'bottle', bg: '#FFD45C', k: '喂养', d: [feedD + (st.waterMl ? `；喝水 ${INT(st.waterMl)} ml（家长记录）` : '')] });
    /* 睡眠 */
    rows.push({ ic: 'sleep', bg: '#8CCBFF', k: '睡眠', d: [st.sleepPerDay !== null ? `日均 ${R1(st.sleepPerDay)} 小时（只统计完整的天）` : `今天已睡 ${R1(st.todaySleepH)} 小时`] });
    /* 尿布 */
    rows.push({ ic: 'diaper', bg: '#8FD9A8', k: '尿布', d: [st.diaperPerDay !== null ? `日均 ${R1(st.diaperPerDay)} 次；${st.poopDays} 天有便便记录` : `今天换尿布 ${INT(st.todayDia)} 次`] });
    /* 体温 · 用药 */
    const tmax = st.temps.length ? st.temps.reduce((a, b) => (b.v > a.v ? b : a)) : null;
    const tlast = st.temps[st.temps.length - 1];
    const medTxt = st.meds.length ? `；用药：${st.meds.map(r => `${dayAt(new Date(r.time), now)} ${r.values.name || '药'}${(r.values.times ?? 1) > 1 ? ` ${r.values.times} 次` : ''}`).join('、')}（家长记录，药名剂量以医嘱为准）` : '';
    rows.push({
      ic: 'thermo', bg: '#FF9EB1', k: `体温 · 共 ${st.temps.length} 次`,
      d: [
        tmax && tlast ? `最高 ${tmax.v.toFixed(1)}℃（${dayAt(tmax.at, now)}）；最近 ${tlast.v.toFixed(1)}℃（${dayAt(tlast.at, now)}，${tlast.site || '腋温'}）${medTxt}` : `近 ${st.n} 天没有体温记录${medTxt}`,
      ],
    });
    /* 症状 */
    if (st.syms.length) rows.push({ ic: 'rash', bg: '#FFE6E0', k: '症状', d: [st.syms.map(r => `${dayAt(new Date(r.time), now)} ${r.values.name || '症状'}`).join('；'), '（家长记录，未做判断）'] });
    /* 健康档案 */
    const ep = activeEpisode(health);
    const past = health.episodes.filter(e => e.status === 'recovered').sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    const epTxt = ep ? `${ep.title}（${epRange(ep)} 起，第 ${episodeDays(ep, now)} 天，进行中）` : past ? `${past.title}（${epRange(past)}，已康复）` : '暂无记录';
    const longMed = health.reminders.filter(r => r.cat === 'med' && r.repeat !== 'none').map(r => r.title);
    const vax = health.vaccines.filter(v => +now - +parseYmd(v.date)! < 60 * 86400000).sort((a, b) => b.date.localeCompare(a.date)).map(v => `${v.name} ${md(parseYmd(v.date)!)}`);
    rows.push({
      ic: 'medbook', bg: '#FFD45C', k: '健康档案',
      d: [
        `既往：${epTxt}`,
        `过敏：${health.allergies.length ? health.allergies.map(a => a.name).join('、') : '暂无已知'}${longMed.length ? ` · 长期用药：${longMed.join('、')}` : ''}`,
        `疫苗：${vax.length ? vax.join('，') : '近 60 天没有接种记录'}`,
      ],
    });
    return {
      title: `${baby.name} · 近 ${st.n} 天记录摘要`,
      sub: `${meta} · 给医生看`,
      rows,
      foot: '「团子育儿本」据家长记录整理 · 不含诊断 · 仅供参考',
      big: false, empty: false,
    };
  }

  /* —— 给奶奶：大字、口语、只讲怎么做 —— */
  const rows: MemoRow[] = [];
  const every = st.feedEveryMin >= 60
    ? `每 ${Math.floor(st.feedEveryMin / 60)} 小时${st.feedEveryMin % 60 ? ` ${st.feedEveryMin % 60} 分` : ''}`
    : `每 ${st.feedEveryMin} 分钟`;
  const perFeed = st.feedMls.length
    ? (st.feedMls[0] === st.feedMls[st.feedMls.length - 1] ? `每次 ${INT(st.feedMls[0])} ml` : `每次 ${INT(st.feedMls[0])}–${INT(st.feedMls[st.feedMls.length - 1])} ml`)
    : '';
  rows.push({
    ic: 'bottle', bg: '#FFD45C', k: '喝奶',
    d: [`大约 ${every} 喝一次${perFeed ? `，${perFeed}` : ''}`, `下一顿大约 ${fmt(st.nextFeed)}`],
  });
  rows.push({ ic: 'sleep', bg: '#8CCBFF', k: '睡觉', d: [`今天已经睡了 ${R1(st.todaySleepH)} 小时`, '醒着 2 小时左右会犯困，揉眼睛、打哈欠就抱去睡'] });
  rows.push({ ic: 'diaper', bg: '#8FD9A8', k: '尿布', d: [`${st.diaperPerDay !== null ? `平均每天 ${R1(st.diaperPerDay)} 次；` : ''}2–3 小时看一次`, st.todayPoop ? '今天已经便便过了' : '今天还没有便便'] });
  /* 小叮嘱：只写今天还没完成的提醒；没有就整行不出现（原型这里是"妈妈备注"，我们没有这个字段） */
  const rem = upcoming(health.reminders, now).filter(x => whenText(x.at, now).startsWith('今天')).slice(0, 2);
  if (rem.length) rows.push({ ic: 'heart', bg: '#FF9EB1', k: '小叮嘱', d: rem.map(x => `${whenText(x.at, now)} ${x.r.title}`) });

  return {
    title: `奶奶，${baby.name}这样带就好啦～`,
    sub: `根据 ${st.rng} 的记录整理 · ${me} & 团团`,
    rows,
    foot: '有事按住团团说一句，我们都能看到',
    big: true, empty: false,
  };
}
