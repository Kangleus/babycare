/* 问团子工具的统计实现：纯函数，只吃 RecordRow[]，不联网。
   口径与 App 的 src/lib/calc.ts 一致：
   - 「近 N 天」= 今天 + 前面 N-1 个整天；日均只算**完整的天（不含今天）**
   - 测量值（体温、身高体重）没测的天不补 0；其它指标没记录的天按 0 计
   - 睡眠跨零点按段切分；夜醒归到「当天 18:00–次日 09:00」这一夜
   时区：tzOffsetMin 取 new Date().getTimezoneOffset()（北京 = -480）。 */

export const DAY = 86400000;

export type RecordRow = {
  type: string; started_at: string; ended_at: string | null;
  vals: Record<string, unknown>; note: string | null; created_by_name: string;
};
export type Metric = 'sleep' | 'feed' | 'diaper' | 'poop' | 'water' | 'temp' | 'night_wakes' | 'growth';
export type RangeKey = 'today' | 'last_night' | 'yesterday' | 'last_3d' | 'last_7d' | 'last_14d' | 'last_30d' | 'date';

export const METRIC_META: Record<Metric, { name: string; unit: string; dec: number; measure?: boolean }> = {
  sleep: { name: '睡眠', unit: '小时', dec: 1 },
  feed: { name: '奶量', unit: 'ml', dec: 0 },
  diaper: { name: '尿布', unit: '次', dec: 0 },
  poop: { name: '便便', unit: '次', dec: 0 },
  water: { name: '喝水', unit: 'ml', dec: 0 },
  temp: { name: '体温', unit: '℃', dec: 1, measure: true },
  night_wakes: { name: '夜醒', unit: '次', dec: 1 },
  growth: { name: '体重', unit: 'kg', dec: 1, measure: true },
};

const pad = (n: number) => String(n).padStart(2, '0');
/** UTC 毫秒 → 家长当地毫秒 */
const local = (ms: number, tz: number) => ms - tz * 60000;
/** 当地某天 0 点对应的 UTC 毫秒 */
const dayStartUtc = (idx: number, tz: number) => idx * DAY + tz * 60000;
const dayIdx = (ms: number, tz: number) => Math.floor(local(ms, tz) / DAY);
const mdOf = (ms: number, tz: number) => { const l = new Date(local(ms, tz)); return `${l.getUTCMonth() + 1}/${pad(l.getUTCDate())}`; };
const hhmmOf = (ms: number, tz: number) => { const l = new Date(local(ms, tz)); return `${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}`; };
const wkOf = (ms: number, tz: number) => '日一二三四五六'[new Date(local(ms, tz)).getUTCDay()];
const round = (v: number, dec: number) => (dec ? Math.round(v * 10) / 10 : Math.round(v));

const startMs = (r: RecordRow) => Date.parse(r.started_at);
const endMs = (r: RecordRow) => (r.ended_at ? Date.parse(r.ended_at) : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

/** 某段睡眠落在 [a,b) 里的分钟数 */
function overlapMin(r: RecordRow, a: number, b: number, nowMs: number): number {
  const s = Math.max(startMs(r), a);
  const e = Math.min(endMs(r) ?? nowMs, b);
  return e > s ? (e - s) / 60000 : 0;
}

/** 某一天某一指标的原始值（sleep=分钟，temp/growth 没有记录时返回 null） */
export function dayValue(metric: Metric, idx: number, records: RecordRow[], tz: number, nowMs: number): number | null {
  const a = dayStartUtc(idx, tz), b = a + DAY;
  const inDay = records.filter(r => { const t = startMs(r); return t >= a && t < b; });
  switch (metric) {
    case 'sleep': {
      // 返回小时（1 位小数在 computeStats 里再统一处理）
      return records.filter(r => r.type === 'sleep').reduce((acc, r) => acc + overlapMin(r, a, b, nowMs), 0) / 60;
    }
    case 'feed': return inDay.filter(r => r.type === 'feed').reduce((acc, r) => acc + num(r.vals.ml), 0);
    case 'diaper': return inDay.filter(r => r.type === 'diaper').length;
    case 'poop': return inDay.filter(r => r.type === 'diaper' && (r.vals.sub === 'poop' || r.vals.sub === 'both')).length;
    case 'water': return inDay.filter(r => r.type === 'water').reduce((acc, r) => acc + num(r.vals.ml), 0);
    case 'temp': {
      const ts = inDay.filter(r => r.type === 'temp' && r.vals.v != null).map(r => num(r.vals.v));
      return ts.length ? Math.max(...ts) : null;
    }
    case 'growth': {
      const gs = inDay.filter(r => r.type === 'growth' && r.vals.kg != null);
      return gs.length ? num(gs[gs.length - 1].vals.kg) : null;
    }
    case 'night_wakes': {
      // 当天 18:00 – 次日 09:00 这一段里开始的睡眠段数 - 1
      const s = a + 18 * 3600000, e = b + 9 * 3600000;
      const n = records.filter(r => r.type === 'sleep' && startMs(r) >= s && startMs(r) < e).length;
      return Math.max(0, n - 1);
    }
  }
}

/** 这一天有没有该指标的记录（用来写「没有记录，按 0 计」） */
function hasAny(metric: Metric, idx: number, records: RecordRow[], tz: number): boolean {
  const a = dayStartUtc(idx, tz), b = a + DAY;
  const t = (r: RecordRow) => startMs(r);
  switch (metric) {
    case 'sleep': return records.some(r => r.type === 'sleep' && t(r) < b && (endMs(r) ?? Infinity) > a);
    case 'feed': return records.some(r => r.type === 'feed' && t(r) >= a && t(r) < b);
    case 'diaper': return records.some(r => r.type === 'diaper' && t(r) >= a && t(r) < b);
    case 'poop': return records.some(r => r.type === 'diaper' && t(r) >= a && t(r) < b && (r.vals.sub === 'poop' || r.vals.sub === 'both'));
    case 'water': return records.some(r => r.type === 'water' && t(r) >= a && t(r) < b);
    case 'temp': return records.some(r => r.type === 'temp' && t(r) >= a && t(r) < b);
    case 'growth': return records.some(r => r.type === 'growth' && t(r) >= a && t(r) < b);
    case 'night_wakes': return records.some(r => r.type === 'sleep' && t(r) >= a + 18 * 3600000 && t(r) < b + 9 * 3600000);
  }
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export type StatsResult = {
  metric: Metric; name: string; unit: string; window: string; full_days: number;
  avg: number | null;
  per_day: { date: string; label: string; value: number | null; low?: boolean }[];
  today_so_far: { value: number; until: string } | null;
  previous: { window: string; avg: number | null } | null;
  delta: number | null;
  extra: Record<string, unknown>;
  data_note?: string;
};

/** 算最近 N 天（完整天，不含今天）的日均 / 每天的值 / 与上一段对比 */
export function computeStats(
  records: RecordRow[], metric: Metric, days: number, tz: number, nowMs: number, comparePrevious = true,
): StatsResult {
  const meta = METRIC_META[metric];
  const todayIdx = dayIdx(nowMs, tz);
  const fullIdx = Array.from({ length: days }, (_, i) => todayIdx - days + i); // 最早 → 昨天
  const raw = fullIdx.map(i => dayValue(metric, i, records, tz, nowMs));
  const vals = raw.map(v => {
    if (meta.measure) return v;
    return v ?? 0;
  });
  const measured = raw.filter((v): v is number => v !== null);
  const avgRaw = meta.measure
    ? (measured.length ? measured.reduce((a, b) => a + b, 0) / measured.length : null)
    : (vals.length ? (vals as number[]).reduce((a, b) => a + b, 0) / vals.length : null);
  const avg = avgRaw === null ? null : round(avgRaw, meta.dec);

  const per_day = fullIdx.map((i, k) => {
    const v = raw[k];
    const shown = v === null ? null : round(v, meta.dec);
    const low = !meta.measure && v !== null && avg !== null && v < avg * 0.85 ? true : undefined;
    return { date: mdOf(dayStartUtc(i, tz), tz), label: wkOf(dayStartUtc(i, tz), tz), value: shown, ...(low ? { low } : {}) };
  });

  // 上一段：再往前 days 个完整天
  let previous: StatsResult['previous'] = null;
  let delta: number | null = null;
  if (comparePrevious) {
    const prevIdx = Array.from({ length: days }, (_, i) => todayIdx - 2 * days + i);
    const prevRaw = prevIdx.map(i => dayValue(metric, i, records, tz, nowMs));
    const prevVals = prevRaw.map(v => (meta.measure ? v : v ?? 0));
    const prevMeasured = prevRaw.filter((v): v is number => v !== null);
    const pAvgRaw = meta.measure
      ? (prevMeasured.length ? prevMeasured.reduce((a, b) => a + b, 0) / prevMeasured.length : null)
      : (prevVals.length ? (prevVals as number[]).reduce((a, b) => a + b, 0) / prevVals.length : null);
    const pAvg = pAvgRaw === null ? null : round(pAvgRaw, meta.dec);
    previous = { window: `${mdOf(dayStartUtc(prevIdx[0], tz), tz)}–${mdOf(dayStartUtc(prevIdx[prevIdx.length - 1], tz), tz)}`, avg: pAvg };
    delta = avg !== null && pAvg !== null ? round(avg - pAvg, meta.dec) : null;
  }

  const todayVal = dayValue(metric, todayIdx, records, tz, nowMs);
  const today_so_far = metric === 'growth' || todayVal === null
    ? null
    : { value: round(todayVal, meta.dec), until: hhmmOf(nowMs, tz) };

  const extra: Record<string, unknown> = {};
  const winStart = dayStartUtc(fullIdx[0], tz), winEnd = dayStartUtc(todayIdx, tz);
  const winRecs = records.filter(r => startMs(r) >= winStart && startMs(r) < winEnd);
  if (metric === 'feed') {
    const mls = winRecs.filter(r => r.type === 'feed' && num(r.vals.ml) > 0).map(r => num(r.vals.ml));
    const times = winRecs.filter(r => r.type === 'feed').map(startMs).sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < times.length; i++) {
      const g = (times[i] - times[i - 1]) / 60000;
      if (g >= 30 && g <= 360) gaps.push(g); // 夜间长间隔不算，与 calc.ts 的 feedGap 一致
    }
    extra.median_ml_per_feed = median(mls);
    extra.feeds_per_day = fullIdx.length ? round(winRecs.filter(r => r.type === 'feed').length / fullIdx.length, 1) : null;
    extra.median_gap_min = median(gaps);
  }
  if (metric === 'temp') {
    const ts = winRecs.filter(r => r.type === 'temp' && r.vals.v != null).sort((a, b) => startMs(a) - startMs(b));
    const last = ts[ts.length - 1];
    extra.max = measured.length ? round(Math.max(...measured), 1) : null;
    extra.latest = last ? { value: num(last.vals.v), time: hhmmOf(startMs(last), tz), flag: flagOf(num(last.vals.v)) } : null;
  }
  if (metric === 'growth') {
    const gs = winRecs.filter(r => r.type === 'growth').sort((a, b) => startMs(a) - startMs(b));
    const last = gs[gs.length - 1];
    extra.latest = last ? { kg: num(last.vals.kg), cm: num(last.vals.cm), date: mdOf(startMs(last), tz) } : null;
  }

  let data_note: string | undefined;
  if (metric !== 'growth') {
    if (meta.measure) {
      const missing = days - measured.length;
      if (missing > 0) data_note = `${missing} 天没有${meta.name}记录（测量值不补 0）`;
    } else {
      const zeroDays = fullIdx.filter(i => !hasAny(metric, i, records, tz)).map(i => mdOf(dayStartUtc(i, tz), tz));
      if (zeroDays.length) data_note = `${zeroDays.join('、')} 没有${meta.name}记录，按 0 计`;
    }
  }

  return {
    metric, name: meta.name, unit: meta.unit,
    window: `${mdOf(winStart, tz)}–${mdOf(winEnd - DAY, tz)}（${days} 个完整天，不含今天）`,
    full_days: days,
    avg,
    per_day,
    today_so_far,
    previous,
    delta,
    extra,
    ...(data_note ? { data_note } : {}),
  };
}

export function flagOf(v: number): '及时就医' | '偏高' | undefined {
  if (v >= 38) return '及时就医';
  if (v >= 37.5) return '偏高';
  return undefined;
}

/* ---------- query_events 用：时间窗口 ---------- */

export function rangeWindow(range: RangeKey, tz: number, nowMs: number, date?: string): { from: number; to: number; label: string } {
  const todayIdx = dayIdx(nowMs, tz);
  const todayStart = dayStartUtc(todayIdx, tz);
  const mk = (fromIdx: number, toIdx: number, label: string) => ({ from: dayStartUtc(fromIdx, tz), to: dayStartUtc(toIdx, tz), label });
  switch (range) {
    case 'today': return { from: todayStart, to: nowMs, label: `今天（${mdOf(todayStart, tz)}）` };
    case 'yesterday': return mk(todayIdx - 1, todayIdx, `昨天（${mdOf(todayStart - DAY, tz)}）`);
    case 'last_night': {
      const from = dayStartUtc(todayIdx - 1, tz) + 18 * 3600000;
      const end = dayStartUtc(todayIdx, tz) + 9 * 3600000;
      const to = Math.min(end, Math.max(nowMs, from + 60000));
      return { from, to, label: `昨晚（${mdOf(from, tz)} 18:00–${mdOf(to, tz)} ${hhmmOf(to, tz)}）` };
    }
    case 'last_3d': return mk(todayIdx - 2, todayIdx + 1, '近 3 天');
    case 'last_7d': return mk(todayIdx - 6, todayIdx + 1, '近 7 天');
    case 'last_14d': return mk(todayIdx - 13, todayIdx + 1, '近 14 天');
    case 'last_30d': return mk(todayIdx - 29, todayIdx + 1, '近 30 天');
    case 'date': {
      const idx = dateToIdx(date ?? '', tz);
      const i = Number.isFinite(idx) ? idx : todayIdx;
      return mk(i, i + 1, date || mdOf(dayStartUtc(i, tz), tz));
    }
  }
}

/** YYYY-MM-DD 在家长当地时区的 day index（和 now 的 tz 一致） */
export function dateToIdx(date: string, tz: number): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return NaN;
  // 当地 0 点的 UTC 时刻 = Date.UTC(Y,M-1,D) + tz*60000；
  // day index = (那个时刻 - tz*60000) / DAY = Date.UTC(Y,M-1,D) / DAY
  const idx = Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY);
  void tz;
  return idx;
}

/* ---------- query_events 用：明细 ---------- */

const SUBN: Record<string, string> = { formula: '奶粉', bm: '瓶喂母乳', breast: '亲喂', pee: '尿尿', poop: '便便', both: '尿+便' };
const dur = (min: number) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? (m ? `${h}h${m}m` : `${h}h`) : `${m}m`; };

/** 一条记录的展示文案（口径同 src/lib/calc.ts 的 evTitle / evMeta；用药永远不带剂量） */
export function eventText(r: RecordRow, tz: number): string {
  const v = r.vals ?? {};
  switch (r.type) {
    case 'feed': {
      const sub = SUBN[String(v.sub ?? 'formula')] ?? '';
      if (num(v.ml)) return `喂奶 · ${sub} ${num(v.ml)}ml`;
      return v.mins ? `亲喂 · ${num(v.mins)} 分钟` : `喂奶 · ${sub}`;
    }
    case 'sleep': {
      if (!r.ended_at) return '睡眠 · 进行中';
      return `睡眠 ${dur((Date.parse(r.ended_at) - startMs(r)) / 60000)}`;
    }
    case 'diaper': return `换尿布 · ${SUBN[String(v.sub ?? 'pee')] ?? ''}`;
    case 'water': return `喝水 · ${num(v.ml)}ml`;
    case 'med': return `用药「${String(v.name ?? '药')}」${num(v.times) || 1} 次（家长记录）`;
    case 'temp': return `体温 ${num(v.v).toFixed(1)}℃（${String(v.site ?? '腋温')}）`;
    case 'symptom': return `症状「${String(v.name ?? '症状')}」`;
    case 'growth': return `身高体重 ${num(v.cm)}cm ${num(v.kg)}kg`;
    case 'bath': return num(v.mins) ? `洗澡 ${num(v.mins)} 分钟` : '洗澡';
    default: return r.type;
  }
}

export type QueryResult = {
  range_label: string; type: string; count: number; truncated: boolean;
  events: { day: string; time: string; end?: string | null; dur_min?: number; text: string; flag?: string; by: string }[];
  extra?: { night_wakes?: number; longest_sleep_min?: number };
};

export function queryEvents(
  records: RecordRow[], type: string, range: RangeKey, tz: number, nowMs: number, limit = 30, date?: string,
): QueryResult {
  const w = range === 'date' ? rangeForDate(date, tz, nowMs) : rangeWindow(range, tz, nowMs);
  const matchType = (r: RecordRow) => {
    if (type === 'all') return true;
    if (type === 'poop') return r.type === 'diaper' && (r.vals?.sub === 'poop' || r.vals?.sub === 'both');
    if (type === 'diaper') return r.type === 'diaper';
    return r.type === type;
  };
  const inWin = records.filter(r => {
    if (!matchType(r)) return false;
    const s = startMs(r);
    if (s > nowMs) return false;
    if (r.type === 'sleep') {
      const e = endMs(r);
      return e === null ? (s >= w.from && s < w.to) : (s < w.to && e > w.from);
    }
    return s >= w.from && s < w.to;
  });
  const sorted = inWin.sort((a, b) => startMs(b) - startMs(a)).slice(0, limit);
  const events = sorted.map(r => {
    const t = startMs(r);
    const e = endMs(r);
    const base = {
      day: mdOf(t, tz), time: hhmmOf(t, tz),
      ...(r.type === 'sleep' ? { end: r.ended_at ? hhmmOf(e!, tz) : null, dur_min: e ? Math.round((e - t) / 60000) : undefined } : {}),
      text: eventText(r, tz),
      ...(r.type === 'temp' ? { flag: flagOf(num(r.vals?.v)) } : {}),
      by: r.created_by_name,
    };
    return base;
  });
  const result: QueryResult = {
    range_label: w.label, type, count: inWin.length, truncated: inWin.length > sorted.length, events,
  };
  if ((type === 'sleep' || type === 'all') && (range === 'last_night' || range === 'yesterday' || range === 'date')) {
    const nights = records.filter(r => r.type === 'sleep' && startMs(r) >= w.from && startMs(r) < w.to);
    const longest = nights.reduce((acc, r) => Math.max(acc, ((endMs(r) ?? nowMs) - startMs(r)) / 60000), 0);
    result.extra = { night_wakes: Math.max(0, nights.length - 1), longest_sleep_min: Math.round(longest) };
  }
  return result;
}

function rangeForDate(date: string | undefined, tz: number, nowMs: number) {
  const idx = dateToIdx(date ?? '', tz);
  if (!Number.isFinite(idx)) return rangeWindow('today', tz, nowMs);
  const from = dayStartUtc(idx, tz);
  return { from, to: from + DAY, label: date ?? '' };
}
