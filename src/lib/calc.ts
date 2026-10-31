/* 原型 app2/app5/app6 的计算逻辑移植（totals / predict / cardVal / 时间线文案） */
import { Ev, NOW, Reminder } from '@/data/mock';
import type { Kind } from '@/theme/tokens';

export const tm = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
export const fmt = (m: number) => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
export const dur = (m: number) => { const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h}h${r}m` : `${h}h`) : `${r}m`; };

export function totals(events: Ev[]) {
  let ml = 0, feeds = 0, sl = 0, dia = 0; let sleeping: Ev | null = null;
  events.forEach(e => {
    if (e.type === 'feed') { feeds++; ml += e.ml || 0; }
    if (e.type === 'diaper') dia++;
    if (e.type === 'sleep') { if (e.end) sl += tm(e.end) - tm(e.start); else { sleeping = e; sl += Math.max(0, NOW - tm(e.start)); } }
  });
  return { ml, feeds, sl, dia, sleeping: sleeping as Ev | null };
}

export function predict(events: Ev[]) {
  const feeds = events.filter(e => e.type === 'feed').sort((a, b) => tm(b.start) - tm(a.start));
  const last = feeds[0] ? tm(feeds[0].start) : NOW;
  const next = last + 200, left = next - NOW;
  const sleeps = events.filter(e => e.type === 'sleep');
  const ongoing = sleeps.find(e => !e.end);
  const lastWake = Math.max(...sleeps.filter(e => e.end).map(e => tm(e.end!)));
  return { next, left, win: [next - 15, next + 15], nap: lastWake + 120, ongoing };
}

/* 文本片段：num=true 用 Nunito 900 数字样式 */
export type Seg = { t: string; num?: boolean };
export function leftSegs(m: number): Seg[] {
  if (m <= 0) return [{ t: '差不多', num: true }, { t: '该饿饿啦' }];
  if (m < 60) return [{ t: '预计 ' }, { t: String(m), num: true }, { t: ' 分钟后饿饿' }];
  const h = Math.round(m / 30) / 2; return [{ t: '预计 ' }, { t: String(h), num: true }, { t: ' 小时后饿饿' }];
}

export type CardVal = { v: string | number; u: string; s: string; tag?: 'hi' | 'ok' };
export function cardVal(k: Kind, events: Ev[], reminders: Reminder[]): CardVal {
  const T = totals(events), of = (t: Kind) => events.filter(e => e.type === t), dia = of('diaper');
  const lastOf = (t: Kind) => of(t).sort((a, b) => tm(b.start) - tm(a.start))[0];
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
    case 'growth': { const g = lastOf('growth'); return g ? { v: g.kg!, u: 'kg', s: `${g.cm}cm · 今天` } : { v: '7.9', u: 'kg', s: '67.5cm · 9/28' }; }
    case 'bath': { const b = lastOf('bath'); return b ? { v: of('bath').length, u: '次', s: `洗澡 · ${b.start}` } : { v: 0, u: '次', s: '上次 昨晚 19:30' }; }
  }
}

const SUBN: Record<string, string> = { formula: '奶粉', bm: '瓶喂母乳', breast: '亲喂', pee: '尿尿', poop: '便便', both: '尿+便' };
/* 标题片段 + 徽标（进行中 / 偏高） */
export function evTitle(e: Ev): { segs: Seg[]; badge?: 'ongo' | 'hi' } {
  switch (e.type) {
    case 'temp': return { segs: [{ t: '体温 · ' }, { t: String(e.v), num: true }, { t: '℃' }], badge: (e.v || 0) >= 37.5 ? 'hi' : undefined };
    case 'med': return { segs: [{ t: `用药 · ${e.name}` }] };
    case 'symptom': return { segs: [{ t: `症状 · ${e.name}` }] };
    case 'water': return { segs: [{ t: '喝水 · ' }, { t: String(e.ml), num: true }, { t: 'ml' }] };
    case 'growth': return { segs: [{ t: '身高体重 · ' }, { t: String(e.cm), num: true }, { t: 'cm ' }, { t: String(e.kg), num: true }, { t: 'kg' }] };
    case 'bath': return { segs: e.mins ? [{ t: '洗澡 · ' }, { t: String(e.mins), num: true }, { t: ' 分钟' }] : [{ t: '洗澡' }] };
    case 'feed': return { segs: [{ t: e.sub === 'breast' ? '亲喂' : '瓶喂' }, ...(e.ml ? [{ t: ' · ' }, { t: String(e.ml), num: true }, { t: 'ml' }] : [])] };
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
  if (e.type === 'sleep') parts.push(e.end ? `${e.cont ? '昨晚' : e.start}–${e.end}` : `${e.start} 入睡`);
  parts.push(e.by + '记');
  return parts.join(' · ');
}
