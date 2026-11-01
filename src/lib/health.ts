/* 健康页的纯计算（没有 AI）：免疫规划参考日期、提醒的下一次到点、病程关联记录、体温曲线点、团团建议规则。 */
import type { Baby, BabyRecord, Episode, HealthData, RemCat, Reminder } from '@/data/types';
import { addDays, DAY, hhmm, md, parseYmd, startOfDay, WK, ymd } from './time';
import { dayEvs, totals } from './calc';

/* —— 国家免疫规划（参考）——
   来源：国家卫生健康委《国家免疫规划疫苗儿童免疫程序及说明（2021 年版）》；
   百白破自 2025-01-01 起按国家疾控局等《关于国家免疫规划百白破疫苗和白破疫苗免疫程序调整相关工作的通知》
   （国疾控卫免发〔2024〕20 号）调整为 2、4、6、18 月龄和 6 周岁各 1 剂。
   体检：《国家基本公共卫生服务规范（第三版）》0～6 岁儿童健康管理（满月、3、6、8、12、18、24、30、36 月龄，之后每年 1 次）。 */
export const PLAN_SOURCE = '参考：国家免疫规划疫苗儿童免疫程序（2021 年版，含 2025 年百白破程序调整）· 国家基本公共卫生服务规范 0～6 岁儿童健康管理';
export const PLAN_SOURCE_SHORT = '国家免疫规划（参考）· 以接种本和接种门诊通知为准';
export type PlanItem = { key: string; cat: 'vax' | 'check'; name: string; months: number };
const V = (key: string, name: string, months: number): PlanItem => ({ key, cat: 'vax', name, months });
const C = (months: number, name: string): PlanItem => ({ key: `check-${months}`, cat: 'check', name, months });
export const PLAN: PlanItem[] = [
  V('hepb-1', '乙肝疫苗 第 1 剂', 0), V('bcg-1', '卡介苗', 0),
  V('hepb-2', '乙肝疫苗 第 2 剂', 1),
  V('ipv-1', '脊灰灭活疫苗 第 1 剂', 2), V('dtap-1', '百白破疫苗 第 1 剂', 2),
  V('ipv-2', '脊灰灭活疫苗 第 2 剂', 3),
  V('bopv-3', '脊灰减毒活疫苗 第 3 剂', 4), V('dtap-2', '百白破疫苗 第 2 剂', 4),
  V('hepb-3', '乙肝疫苗 第 3 剂', 6), V('mpsva-1', 'A 群流脑 第 1 剂', 6), V('dtap-3', '百白破疫苗 第 3 剂', 6),
  V('mmr-1', '麻腮风 第 1 剂', 8), V('je-1', '乙脑 第 1 剂', 8),
  V('mpsva-2', 'A 群流脑 第 2 剂', 9),
  V('dtap-4', '百白破疫苗 第 4 剂', 18), V('mmr-2', '麻腮风 第 2 剂', 18), V('hepa-1', '甲肝减毒活疫苗', 18),
  V('je-2', '乙脑 第 2 剂', 24),
  V('mpsvac-1', 'A 群 C 群流脑 第 1 剂', 36),
  V('bopv-4', '脊灰减毒活疫苗 第 4 剂', 48),
  V('dtap-5', '百白破疫苗 第 5 剂', 72), V('mpsvac-2', 'A 群 C 群流脑 第 2 剂', 72),
  C(1, '满月体检'), C(3, '3 月龄体检'), C(6, '6 月龄体检'), C(8, '8 月龄体检'), C(12, '1 岁体检'), C(18, '18 月龄体检'),
  C(24, '2 岁体检'), C(30, '30 月龄体检'), C(36, '3 岁体检'), C(48, '4 岁体检'), C(60, '5 岁体检'), C(72, '6 岁体检'),
];
export const ageLabel = (m: number) => (m === 0 ? '出生时' : m < 24 || m % 12 ? `${m} 月龄` : `${m / 12} 周岁`);
export function planDate(baby: Baby, months: number) {
  const b = parseYmd(baby.birthday) ?? new Date();
  const d = new Date(b.getFullYear(), b.getMonth() + months, b.getDate());
  if (d.getDate() !== b.getDate()) d.setDate(0); // 1/31 + 1 月 → 2 月最后一天
  return d;
}

/* —— 提醒：下一次到点 —— */
const STEP = { none: 0, daily: DAY, weekly: 7 * DAY };
const EARLY = 2 * 3600000; // 提前 2 小时内点「完成」算这一次
export function nextOcc(r: Reminder, now: Date): { at: Date; done: boolean } {
  const d0 = Date.parse(r.dueAt);
  if (r.repeat === 'none') return { at: new Date(d0), done: !!r.doneAt };
  const step = STEP[r.repeat];
  let at = now.getTime() < d0 ? d0 : d0 + Math.floor((now.getTime() - d0) / step) * step;
  if (now.getTime() - at > EARLY) at += step; // 错过 2 小时以上的那一次不再挂着，看下一次
  const done = r.doneAt ? Date.parse(r.doneAt) : -Infinity;
  while (done >= at - EARLY) at += step;
  return { at: new Date(at), done: false };
}
export function whenText(at: Date, now: Date, withTime = true) {
  const d = Math.round((startOfDay(at).getTime() - startOfDay(now).getTime()) / DAY);
  const day = d === 0 ? '今天' : d === 1 ? '明天' : d === -1 ? '昨天' : `${md(at)} 周${WK[at.getDay()]}`;
  return withTime ? `${day} ${hhmm(at)}` : day;
}
export const REP_T = { none: '', daily: '每天', weekly: '每周' } as const;
export const RCAT: Record<RemCat, { n: string; ic: 'pill' | 'hosp' | 'syringe' | 'medbook' | 'thermo'; c: 'lilac' | 'blue' | 'green' | 'orange' | 'pink' }> = {
  med: { n: '用药', ic: 'pill', c: 'lilac' }, visit: { n: '复诊', ic: 'hosp', c: 'blue' }, vax: { n: '疫苗', ic: 'syringe', c: 'green' },
  check: { n: '体检', ic: 'medbook', c: 'orange' }, temp: { n: '体温', ic: 'thermo', c: 'pink' },
};
/** 首页 / 横幅用：没完成、已确认的提醒，按下一次到点排序 */
export function upcoming(rs: Reminder[], now: Date) {
  return rs.filter(r => r.confirmed).map(r => ({ r, ...nextOcc(r, now) })).filter(x => !x.done).sort((a, b) => +a.at - +b.at);
}

/* —— 病程 —— */
export const HEALTH_TYPES = ['temp', 'med', 'symptom'] as const;
export const activeEpisode = (h: HealthData) => h.episodes.filter(e => e.status === 'active').sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;
/** 病程的记录 = 开始日起（康复的到结束日为止）的体温 / 用药 / 症状；首页记的自动算进来，不用再记一遍 */
export function episodeRecords(records: BabyRecord[], ep: Episode) {
  const s = parseYmd(ep.startDate)!.getTime();
  const e = ep.status === 'recovered' && ep.endDate ? parseYmd(ep.endDate)!.getTime() + DAY : Infinity;
  return records.filter(r => (HEALTH_TYPES as readonly string[]).includes(r.type) && +new Date(r.time) >= s && +new Date(r.time) < e).sort((a, b) => +new Date(a.time) - +new Date(b.time));
}
export const episodeDays = (ep: Episode, now: Date) => {
  const s = parseYmd(ep.startDate)!, e = ep.status === 'recovered' && ep.endDate ? parseYmd(ep.endDate)! : startOfDay(now);
  return Math.round((e.getTime() - s.getTime()) / DAY) + 1;
};
export const epRange = (ep: Episode) => `${md(parseYmd(ep.startDate)!)}${ep.endDate ? '–' + md(parseYmd(ep.endDate)!) : ' 起'}`;

/* —— 团团建议（规则，不是 AI）—— */
export type Sugg = {
  id: string; ic: 'thermo' | 'syringe' | 'sleep' | 'ruler' | 'medbook' | 'doc'; k: 'pink' | 'green' | 'blue' | 'orange' | 'lilac';
  t: { t: string; b?: boolean }[]; s: string; risk?: boolean;
  rem?: Omit<Reminder, 'id' | 'babyId' | 'createdBy' | 'createdAt' | 'updatedAt' | 'doneAt' | 'doneBy'>; btn?: string; action?: 'summary';
  /** 有待办的复诊提醒时，可以把这句并进它的备注（原型「复查时问问」） */ ask?: string;
};
const nightWakes = (records: BabyRecord[], day: Date) =>
  /* 夜里（0:00–6:00）开始的睡眠段数 - 1 ≈ 夜醒次数 */
  Math.max(0, records.filter(r => r.type === 'sleep' && startOfDay(new Date(r.time)).getTime() === day.getTime() && new Date(r.time).getHours() < 6).length - 1);
export function suggestions(baby: Baby, records: BabyRecord[], h: HealthData, now: Date, gone: string[] = []): Sugg[] {
  const L: Sugg[] = [];
  const today = startOfDay(now);
  /* 1. 体温：最近 24 小时最后一次 */
  const temps = records.filter(r => r.type === 'temp' && +new Date(r.time) <= +now && +now - +new Date(r.time) < DAY).sort((a, b) => +new Date(b.time) - +new Date(a.time));
  const t = temps[0], v = t?.values.v ?? 0;
  const tAt = t ? new Date(t.time) : null;
  if (t && v >= 38) L.push({ id: `fever-${t.id}`, risk: true, ic: 'thermo', k: 'pink', t: [{ t: `${whenText(tAt!, now)} 记了 ` }, { t: `${v.toFixed(1)}℃`, b: true }, { t: '，建议及时就医' }],
    s: '尤其精神差、呼吸急促、抽搐、持续高烧不退、不吃不尿时请尽快就医 · 团团不判断病情 · 仅供参考', action: 'summary', btn: '给医生看' });
  else if (t && v >= 37.5) L.push({ id: `warm-${t.id}`, ic: 'thermo', k: 'pink', t: [{ t: `${whenText(tAt!, now)} 记了 ` }, { t: `${v.toFixed(1)}℃`, b: true }, { t: '，偏高，留意观察' }],
    s: '过一会儿再量一次？精神差请及时就医 · 仅供参考',
    rem: { cat: 'temp', title: '再量一次体温', dueAt: new Date(Math.max(+now, +tAt! + 2 * 3600000)).toISOString(), repeat: 'none', note: '只是提醒你量，量完记一笔就好', source: 'suggest', confirmed: true } });
  /* 2. 进行中的病程 */
  const ep = activeEpisode(h);
  if (ep) L.push({ id: `ep-${ep.id}`, ic: 'doc', k: 'lilac', t: [{ t: `「${ep.title}」第 ` }, { t: String(episodeDays(ep, now)), b: true }, { t: ' 天' }], s: '体温、用药、症状都自动归到这次病程里 · 就诊时可以直接给医生看 · 仅供参考', action: 'summary', btn: '给医生看' });
  /* 3. 疫苗 / 体检：30 天内的参考日期（已登记接种或已有提醒的不提） */
  const has = (name: string, key: string) => h.vaccines.some(x => x.name === name) || h.reminders.some(r => r.planKey === key && (r.confirmed || r.doneAt));
  const soon = PLAN.map(p => ({ p, d: planDate(baby, p.months) })).filter(x => +x.d >= +today && +x.d - +today <= 30 * DAY && !has(x.p.name, x.p.key));
  const byDay = new Map<string, typeof soon>();
  soon.forEach(x => { const k = ymd(x.d); byDay.set(k, [...(byDay.get(k) ?? []), x]); });
  for (const [k, xs] of byDay) {
    const d = parseYmd(k)!, vax = xs.filter(x => x.p.cat === 'vax'), chk = xs.filter(x => x.p.cat === 'check');
    const names = [...vax.map(x => x.p.name), ...chk.map(x => x.p.name)].join('、');
    L.push({ id: `plan-${k}`, ic: vax.length ? 'syringe' : 'ruler', k: vax.length ? 'green' : 'orange', t: [{ t: '约 ' }, { t: `${md(d)} 周${WK[d.getDay()]}`, b: true }, { t: ` ${names}` }],
      s: `${ageLabel(xs[0].p.months)} · ${PLAN_SOURCE_SHORT} · 仅供参考`,
      rem: { cat: vax.length ? 'vax' : 'check', title: names, dueAt: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9).toISOString(), repeat: 'none', note: '以接种本和接种门诊通知为准', source: 'plan', planKey: xs.map(x => x.p.key).join('+').slice(0, 40), confirmed: true } });
  }
  /* 4. 睡眠：近 7 天 vs 前 7 天（完整的天） */
  const days = (from: number) => Array.from({ length: 7 }, (_, i) => addDays(today, -(from + i)));
  const hasRec = (d: Date) => records.some(r => startOfDay(new Date(r.time)).getTime() === d.getTime());
  const cur = days(1).filter(hasRec), prev = days(8).filter(hasRec);
  if (cur.length >= 4 && prev.length >= 4) {
    const sl = (ds: Date[]) => ds.reduce((a, d) => a + totals(dayEvs(records, d), 1440).sl, 0) / ds.length / 60;
    const wk = (ds: Date[]) => ds.reduce((a, d) => a + nightWakes(records, d), 0) / ds.length;
    const a = sl(cur), b = sl(prev), dm = Math.round((a - b) * 60), wa = wk(cur), wb = wk(prev);
    if (Math.abs(dm) >= 30 || Math.abs(wa - wb) >= 0.5) {
      const more = wa - wb >= 0.5 ? `，夜里平均多醒 ${(wa - wb).toFixed(1)} 次` : wb - wa >= 0.5 ? `，夜里平均少醒 ${(wb - wa).toFixed(1)} 次` : '';
      L.push({ id: `sleep-${ymd(today)}`, ic: 'sleep', k: 'blue', t: [{ t: `这周睡眠比上周${dm < 0 ? '少' : '多'}约 ` }, { t: `${Math.abs(dm)} 分钟`, b: true }],
        s: `近 7 天日均 ${a.toFixed(1)} h，上周 ${b.toFixed(1)} h${more} · 只做描述 · 仅供参考`, ask: '问问睡眠变化', btn: '复查时问问' });
    }
  }
  /* 5. 没有发热 */
  if (!t || v < 37.5) {
    const hot = records.filter(r => r.type === 'temp' && (r.values.v ?? 0) >= 37.5 && +now - +new Date(r.time) < 14 * DAY).length;
    if (!hot && !ep) L.push({ id: `nofever-${ymd(today)}`, ic: 'thermo', k: 'pink', t: [{ t: '近 2 周' }, { t: '没记到发热', b: true }], s: `${t ? `最近一次：${whenText(tAt!, now)} ${v.toFixed(1)}℃` : '最近 24 小时没有体温记录'} · 家长记录 · 仅供参考`, ask: '带上体温记录', btn: '复查时带上' });
  }
  return L.filter(x => !gone.includes(x.id)).slice(0, 4);
}

/* —— 体温曲线 —— */
export function tempPoints(rs: BabyRecord[]) {
  return rs.filter(r => r.type === 'temp' && r.values.v).map(r => ({ at: new Date(r.time), v: r.values.v! }));
}
