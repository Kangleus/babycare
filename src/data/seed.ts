/* 首次启动的演示数据（豆米）：今天 = 原型 S.events（按「现在」整体平移，演示时刻 10:20 时与原型逐条一致），
   另外补 13 天历史，让趋势图、喂奶间隔预测、周对比都由真实记录算出来。 */
import type { BabyRecord, RecordType, RecordValues } from './types';
import { atMin, addDays, startOfDay } from '@/lib/time';

type T = { type: RecordType; start: string; end?: string; by: string; src: 'voice' | 'manual'; cont?: boolean; v?: RecordValues };
const TODAY: T[] = [
  { type: 'sleep', start: '-02:30', end: '01:15', by: '妈妈', src: 'voice', cont: true },
  { type: 'feed', start: '01:20', by: '妈妈', src: 'voice', v: { sub: 'formula', ml: 180 } },
  { type: 'sleep', start: '01:40', end: '04:15', by: '妈妈', src: 'voice' },
  { type: 'diaper', start: '04:20', by: '妈妈', src: 'manual', v: { sub: 'pee' } },
  { type: 'feed', start: '04:30', by: '妈妈', src: 'voice', v: { sub: 'formula', ml: 160 } },
  { type: 'sleep', start: '04:50', end: '07:20', by: '爸爸', src: 'voice' },
  { type: 'diaper', start: '07:25', by: '爸爸', src: 'manual', v: { sub: 'both' } },
  { type: 'feed', start: '07:40', by: '爸爸', src: 'voice', v: { sub: 'formula', ml: 170 } },
  { type: 'temp', start: '07:30', by: '爸爸', src: 'manual', v: { v: 36.9, site: '腋温' } },
  { type: 'sleep', start: '08:20', end: '09:35', by: '奶奶', src: 'voice' },
  { type: 'water', start: '09:05', by: '奶奶', src: 'manual', v: { ml: 20 } },
  { type: 'diaper', start: '09:40', by: '奶奶', src: 'manual', v: { sub: 'pee' } },
];
/* 历史目标值：最近 6 天对应原型 HIST，之前一周按上周日均 */
const SLEEP_H = [12.4, 12.6, 13.9, 13.6, 13.8, 14.1, 14, 14, 14, 14, 14, 14, 14];   // index 0 = 昨天
const FEED_ML = [760, 790, 770, 800, 760, 780, 772, 770, 775, 772, 770, 775, 770];
const DIAPERS = [8, 7, 7, 8, 7, 8, 7, 8, 7, 8, 7, 7, 8];
const WATER = [40, 50, 30, 40, 20, 30, 30, 30, 30, 30, 30, 30, 30];
const WHO = ['妈妈', '爸爸', '奶奶'];
const m = (s: string) => { const neg = s.startsWith('-'); const [h, mm] = s.replace('-', '').split(':').map(Number); return (neg ? -1 : 1) * (h * 60 + mm); };

export function buildDemo(babyId: string, now: Date): BabyRecord[] {
  const today = startOfDay(now);
  const shift = now.getTime() - atMin(today, 10 * 60 + 20).getTime(); // 让「现在」对应原型的 10:20
  const iso = (d: Date) => new Date(d.getTime() + shift).toISOString();
  const stamp = now.toISOString();
  const out: BabyRecord[] = [];
  let n = 0;
  const push = (day: Date, t: T) => {
    const st = atMin(day, m(t.start));
    out.push({ id: `demo-${++n}`, babyId, type: t.type, time: iso(st), endTime: t.type === 'sleep' ? (t.end ? iso(atMin(day, m(t.end))) : null) : undefined,
      values: t.v ?? {}, createdBy: t.by, src: t.src, createdAt: stamp, updatedAt: stamp });
  };
  TODAY.forEach(t => push(today, t));
  for (let i = 0; i < 13; i++) {
    const day = addDays(today, -(i + 1)), by = WHO[i % 3];
    const H = SLEEP_H[i] * 60;
    /* 睡眠：00:05–03:00、03:30–07:00、09:00–10:30、13:00–(午睡可变)、晚上 20:00–23:50；昨天的晚觉由今天的「昨晚」那条承担 */
    const nap = H - (175 + 210 + 90) - (i === 0 ? 150 : 230);
    const blocks: [number, number][] = [[5, 180], [210, 420], [540, 630], [780, 780 + nap]];
    if (i !== 0) blocks.push([1200, 1430]);
    blocks.forEach(([a, b], j) => out.push({ id: `demo-${++n}`, babyId, type: 'sleep', time: iso(atMin(day, a)), endTime: iso(atMin(day, b)), values: {}, createdBy: WHO[(i + j) % 3], src: 'voice', createdAt: stamp, updatedAt: stamp }));
    /* 喂奶：6 顿，间隔 3h20m */
    const times = [120, 320, 520, 720, 920, 1120], per = FEED_ML[i] / 6;
    times.forEach((t, j) => push(day, { type: 'feed', start: `${Math.floor(t / 60)}:${t % 60}`, by: WHO[(i + j) % 3], src: j % 2 ? 'manual' : 'voice', v: { sub: 'formula', ml: Math.round((per + (j % 2 ? 5 : -5)) / 5) * 5 } }));
    /* 尿布 */
    for (let j = 0; j < DIAPERS[i]; j++) push(day, { type: 'diaper', start: `${1 + Math.floor(j * 2.7)}:${(j * 17) % 60}`, by: WHO[(i + j) % 3], src: 'manual', v: { sub: j === 2 || (j === 5 && i % 2 === 0) ? 'both' : 'pee' } });
    push(day, { type: 'water', start: '15:30', by: by, src: 'manual', v: { ml: WATER[i] } });
    push(day, { type: 'med', start: '10:30', by: '妈妈', src: 'manual', v: { name: '维生素 D', times: 1 } });
    if (i % 3 === 0) push(day, { type: 'temp', start: '19:00', by: '爸爸', src: 'manual', v: { v: [36.8, 36.7, 36.9, 36.8, 36.7][i / 3], site: '腋温' } });
    if (i % 2 === 0) push(day, { type: 'bath', start: '19:30', by: '爸爸', src: 'manual', v: { mins: 10 } });
  }
  /* 9/28 体检时家里记的身高体重（原型「67.5cm · 9/28」） */
  const ck = new Date(today.getFullYear(), 8, 28);
  push(ck < today ? ck : addDays(today, -33), { type: 'growth', start: '10:00', by: '妈妈', src: 'manual', v: { cm: 67.5, kg: 7.9 } });
  return out;
}
