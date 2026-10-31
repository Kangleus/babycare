/* 原型 app2/app5/app6 的计算逻辑移植（totals / predict / cardVal / 时间线文案），数据改为真实记录 */
import type { BabyRecord, RecordType } from '@/data/types';
import type { Kind } from '@/theme/tokens';
import { DAY, hhmm, md, minOf, startOfDay } from './time';

export const tm = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
export const fmt = (m: number) => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
export const dur = (m: number) => { const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h}h${r}m` : `${h}h`) : `${r}m`; };

/** 某一天视角下的记录（原型 S.events 的形状） */
export type Ev = {
  id: string; type: RecordType; start: string; end?: string; cont?: boolean; by: string; src: 'voice' | 'manual';
  sub?: string; ml?: number | null; v?: number; site?: string; name?: string; times?: number; cm?: number; kg?: number; mins?: number;
  note?: string; rec: BabyRecord;
};

/** 取某天（day 的 0 点起 24h）内的记录；跨零点的睡眠截成 00:00 开始（原型「昨晚–01:15」） */
export function dayEvs(records: BabyRecord[], day: Date): Ev[] {
  const a = startOfDay(day).getTime(), b = a + DAY;
  const out: Ev[] = [];
  for (const r of records) {
    const st = new Date(r.time).getTime();
    if (r.type === 'sleep') {
      const en = r.endTime ? new Date(r.endTime).getTime() : null;
      if (st >= b || (en !== null && en <= a)) continue;
      if (en === null && st < a - DAY) continue;
      const cont = st < a;
      out.push({ ...r.values, id: r.id, type: r.type, by: r.createdBy, src: r.src, note: r.note, rec: r, cont,
        start: cont ? '00:00' : hhmm(new Date(st)),
        end: en === null ? undefined : en >= b ? '24:00' : hhmm(new Date(en)) });
    } else if (st >= a && st < b) {
      out.push({ ...r.values, id: r.id, type: r.type, by: r.createdBy, src: r.src, note: r.note, rec: r, start: hhmm(new Date(st)) });
    }
  }
  return out;
}

export function totals(events: Ev[], nowMin: number) {
  let ml = 0, feeds = 0, sl = 0, dia = 0; let sleeping: Ev | null = null;
  events.forEach(e => {
    if (e.type === 'feed') { feeds++; ml += e.ml || 0; }
    if (e.type === 'diaper') dia++;
    if (e.type === 'sleep') { if (e.end) sl += tm(e.end) - tm(e.start); else { sleeping = e; sl += Math.max(0, nowMin - tm(e.start)); } }
  });
  return { ml, feeds, sl, dia, sleeping: sleeping as Ev | null };
}

/** 下一顿预测：最近 7 天相邻两顿的平均间隔（> 6 小时的夜间长间隔不算），四舍五入到 5 分钟；记录不足时用 3h20m */
export const DEFAULT_GAP = 200;
export function feedGap(records: BabyRecord[], now: Date) {
  const from = now.getTime() - 7 * DAY;
  const ts = records.filter(r => r.type === 'feed').map(r => new Date(r.time).getTime()).filter(t => t >= from && t <= now.getTime()).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < ts.length; i++) { const g = (ts[i] - ts[i - 1]) / 60000; if (g >= 30 && g <= 360) gaps.push(g); }
  if (gaps.length < 3) return { gap: DEFAULT_GAP, n: gaps.length, enough: false };
  return { gap: Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length / 5) * 5, n: gaps.length, enough: true };
}
export function predict(records: BabyRecord[], events: Ev[], now: Date) {
  const nowMin = minOf(now), today = startOfDay(now).getTime();
  const lastFeed = records.filter(r => r.type === 'feed' && new Date(r.time) <= now).sort((a, b) => +new Date(b.time) - +new Date(a.time))[0];
  const { gap, enough } = feedGap(records, now);
  const last = lastFeed ? Math.round((new Date(lastFeed.time).getTime() - today) / 60000) : null;
  const next = (last ?? nowMin) + gap, left = next - nowMin;
  const sleeps = events.filter(e => e.type === 'sleep');
  const ongoing = sleeps.find(e => !e.end);
  const wakes = sleeps.filter(e => e.end).map(e => tm(e.end!));
  const lastWake = wakes.length ? Math.max(...wakes) : nowMin;
  return { next, left, win: [next - 15, next + 15], nap: lastWake + 120, ongoing, hasFeed: !!lastFeed, enough, gap };
}

/* 文本片段：num=true 用 Nunito 900 数字样式 */
export type Seg = { t: string; num?: boolean };
export function leftSegs(m: number): Seg[] {
  if (m <= 0) return [{ t: '差不多', num: true }, { t: '该饿饿啦' }];
  if (m < 60) return [{ t: '预计 ' }, { t: String(m), num: true }, { t: ' 分钟后饿饿' }];
  const h = Math.round(m / 30) / 2; return [{ t: '预计 ' }, { t: String(h), num: true }, { t: ' 小时后饿饿' }];
}

export type Reminderish = { cat: string; done?: boolean; when: string };
export type CardVal = { v: string | number; u: string; s: string; tag?: 'hi' | 'ok' };
export function cardVal(k: Kind, events: Ev[], reminders: Reminderish[], all: BabyRecord[], now: Date): CardVal {
  const T = totals(events, minOf(now)), of = (t: RecordType) => events.filter(e => e.type === t), dia = of('diaper');
  const lastOf = (t: RecordType) => of(t).sort((a, b) => tm(b.start) - tm(a.start))[0];
  const lastEver = (t: RecordType) => all.filter(r => r.type === t && new Date(r.time) <= now).sort((a, b) => +new Date(b.time) - +new Date(a.time))[0];
  switch (k) {
    case 'feed': return { v: T.ml, u: 'ml', s: `喂奶 ${T.feeds} 次` };
    case 'sleep': return { v: (T.sl / 60).toFixed(1), u: 'h', s: `睡眠${T.sleeping ? ' · 睡着中' : ''}` };
    case 'diaper': return { v: T.dia, u: '次', s: '换尿布' };
    case 'pee': return { v: dia.filter(e => e.sub !== 'poop').length, u: '次', s: '尿尿' };
    case 'poop': { const p = dia.filter(e => e.sub !== 'pee').sort((a, b) => tm(b.start) - tm(a.start)); return { v: p.length, u: '次', s: p[0] ? `便便 · ${p[0].start}` : '便便' }; }
    case 'water': { const w = of('water'); return { v: w.reduce((a, e) => a + (e.ml || 0), 0), u: 'ml', s: `喝水 ${w.length} 次` }; }
    case 'med': { const n = of('med').length; const r = reminders.find(x => x.cat === 'med' && !x.done && x.when.startsWith('今天')); const t = r && r.when.match(/\d{1,2}:\d{2}/); return { v: n, u: '次', s: t ? `吃药 · 下次 ${t[0]}` : '今日吃药' }; }
    case 'temp': { const t = lastOf('temp'); if (!t) return { v: '—', u: '', s: '体温 · 今天未测' }; const hi = (t.v || 0) >= 37.5; return { v: t.v!, u: '℃', s: t.start, tag: hi ? 'hi' : 'ok' }; }
    case 'symptom': { const s = lastOf('symptom'); return { v: of('symptom').length, u: '条', s: s ? s.name! : '症状 · 今天没有' }; }
    case 'growth': {
      const g = lastEver('growth'); if (!g) return { v: '—', u: '', s: '身高体重 · 还没记' };
      const d = new Date(g.time), today = startOfDay(now).getTime() === startOfDay(d).getTime();
      return { v: g.values.kg!, u: 'kg', s: `${g.values.cm}cm · ${today ? '今天' : md(d)}` };
    }
    case 'bath': {
      const b = lastOf('bath'); if (b) return { v: of('bath').length, u: '次', s: `洗澡 · ${b.start}` };
      const p = lastEver('bath'); if (!p) return { v: 0, u: '次', s: '洗澡 · 还没记' };
      const d = new Date(p.time), y = startOfDay(now).getTime() - startOfDay(d).getTime() === DAY;
      return { v: 0, u: '次', s: `上次 ${y ? '昨晚' : md(d)} ${hhmm(d)}` };
    }
  }
}

export const SUBN: Record<string, string> = { formula: '奶粉', bm: '瓶喂母乳', breast: '亲喂', pee: '尿尿', poop: '便便', both: '尿+便' };
/* 标题片段 + 徽标（进行中 / 偏高） */
export function evTitle(e: Ev): { segs: Seg[]; badge?: 'ongo' | 'hi' } {
  switch (e.type) {
    case 'temp': return { segs: [{ t: '体温 · ' }, { t: String(e.v), num: true }, { t: '℃' }], badge: (e.v || 0) >= 37.5 ? 'hi' : undefined };
    case 'med': return { segs: [{ t: `用药 · ${e.name}` }] };
    case 'symptom': return { segs: [{ t: `症状 · ${e.name}` }] };
    case 'water': return { segs: [{ t: '喝水 · ' }, { t: String(e.ml), num: true }, { t: 'ml' }] };
    case 'growth': return { segs: [{ t: '身高体重 · ' }, { t: String(e.cm), num: true }, { t: 'cm ' }, { t: String(e.kg), num: true }, { t: 'kg' }] };
    case 'bath': return { segs: e.mins ? [{ t: '洗澡 · ' }, { t: String(e.mins), num: true }, { t: ' 分钟' }] : [{ t: '洗澡' }] };
    case 'feed': return { segs: [{ t: e.sub === 'breast' ? '亲喂' : '瓶喂' }, ...(e.ml ? [{ t: ' · ' }, { t: String(e.ml), num: true }, { t: 'ml' }] : e.sub === 'breast' && e.mins ? [{ t: ' · ' }, { t: String(e.mins), num: true }, { t: ' 分钟' }] : [])] };
    case 'sleep': return e.end ? { segs: [{ t: '睡觉 · ' }, { t: dur(tm(e.end) - tm(e.start)), num: true }] } : { segs: [{ t: '睡觉中' }], badge: 'ongo' };
    default: return { segs: [{ t: `换尿布 · ${SUBN[e.sub || 'pee']}` }] };
  }
}
export function evMeta(e: Ev): string {
  switch (e.type) {
    case 'temp': return `${e.site || '腋温'} · ${e.by}记`;
    case 'med': return `${e.times || 1} 次 · 只记你说的 · ${e.by}记`;
    case 'symptom': case 'water': case 'bath': return `${e.by}记`;
    case 'growth': return `家里量的 · ${e.by}记`;
  }
  const parts: string[] = [];
  if (e.type === 'feed') parts.push(SUBN[e.sub || 'formula']);
  if (e.type === 'sleep') parts.push(e.end ? `${e.cont ? '昨晚' : e.start}–${e.end === '24:00' ? '次日' : e.end}` : `${e.cont ? '昨晚 ' + hhmm(new Date(e.rec.time)) : e.start} 入睡`);
  parts.push(e.by + '记');
  return parts.join(' · ');
}

/* ---------- 趋势（原型 app7 chartHTML 的数据部分） ---------- */
export const METRIC: Record<Kind, { n: string; u: string; dec?: number }> = {
  feed: { n: '奶量', u: 'ml' }, sleep: { n: '睡眠', u: '小时', dec: 1 }, diaper: { n: '尿布', u: '次' }, water: { n: '喝水', u: 'ml' },
  pee: { n: '尿尿', u: '次' }, poop: { n: '便便', u: '次' }, bath: { n: '洗澡', u: '次' }, med: { n: '吃药', u: '次' },
  temp: { n: '体温', u: '℃', dec: 1 }, symptom: { n: '症状', u: '条' }, growth: { n: '体重', u: 'kg', dec: 1 },
};
/** 某天某类的数值；体温 / 体重是「当天最后一次」，没有记录返回 null */
export function dayValue(k: Kind, events: Ev[], nowMin: number): number | null {
  const T = totals(events, nowMin), of = (t: RecordType) => events.filter(e => e.type === t);
  const last = (t: RecordType) => of(t).sort((a, b) => tm(b.start) - tm(a.start))[0];
  switch (k) {
    case 'sleep': return +(T.sl / 60).toFixed(1);
    case 'feed': return T.ml;
    case 'diaper': return T.dia;
    case 'water': return of('water').reduce((a, e) => a + (e.ml || 0), 0);
    case 'pee': return of('diaper').filter(e => e.sub !== 'poop').length;
    case 'poop': return of('diaper').filter(e => e.sub !== 'pee').length;
    case 'bath': return of('bath').length;
    case 'med': return of('med').length;
    case 'symptom': return of('symptom').length;
    case 'temp': { const t = last('temp'); return t ? t.v! : null; }
    case 'growth': { const g = last('growth'); return g ? g.kg! : null; }
  }
}
/** 趋势列表里属于这张卡的记录 */
export function kindRows(k: Kind, events: Ev[]) {
  const t: RecordType = k === 'pee' || k === 'poop' ? 'diaper' : k;
  let ev = events.filter(e => e.type === t);
  if (k === 'pee') ev = ev.filter(e => e.sub !== 'poop'); if (k === 'poop') ev = ev.filter(e => e.sub !== 'pee');
  return ev.sort((a, b) => tm(b.start) - tm(a.start));
}
