/* 时间工具：记录用 ISO 存，界面按「当天 HH:MM」展示 */
export const DAY = 86400000;
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds());
export const pad = (n: number) => String(n).padStart(2, '0');
export const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
export const WK = '日一二三四五六';
export function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s.trim()); if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null;
}
/** 「7 个月 3 天 · 周六」—— 原型 .age */
export function ageParts(birth: Date, today: Date) {
  let m = (today.getFullYear() - birth.getFullYear()) * 12 + today.getMonth() - birth.getMonth();
  let d = today.getDate() - birth.getDate();
  if (d < 0) { m -= 1; d += new Date(today.getFullYear(), today.getMonth(), 0).getDate(); }
  return { m: Math.max(0, m), d: Math.max(0, d), born: today >= startOfDay(birth) };
}
export function ageText(birthday: string, today: Date, withWeek = true) {
  const b = parseYmd(birthday); if (!b) return '';
  const a = ageParts(b, today);
  /* 原型 #onboarding ageOf()：不满 1 个月显示「出生第 N 天」，整月不带「0 天」 */
  const age = !a.born ? '还没出生' : a.m ? `${a.m} 个月${a.d ? ` ${a.d} 天` : ''}` : `出生第 ${Math.round((startOfDay(today).getTime() - b.getTime()) / DAY) + 1} 天`;
  return withWeek ? `${age} · 周${WK[today.getDay()]}` : age;
}
/** 把「当天第 N 分钟」换算成 Date */
export const atMin = (day: Date, min: number) => new Date(startOfDay(day).getTime() + min * 60000);
export const minOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
