/* 本地演示数据（与原型 app2/app5 的 S.events / S.reminders 一致）。M2 起换成云端数据。 */
import type { IconName } from '@/lib/art';
import type { Kind } from '@/theme/tokens';

export const BABY = { name: '豆米', birth: new Date(2026, 2, 28) };
/* 演示「今天」：2026-10-31（周六）10:20，与原型一致 */
export const DEMO_DAY = new Date(2026, 9, 31);
export const NOW = 10 * 60 + 20;

export function ageText(birth = BABY.birth, today = DEMO_DAY) {
  let m = (today.getFullYear() - birth.getFullYear()) * 12 + today.getMonth() - birth.getMonth();
  let d = today.getDate() - birth.getDate();
  if (d < 0) { m -= 1; d += new Date(today.getFullYear(), today.getMonth(), 0).getDate(); }
  const wk = '日一二三四五六'[today.getDay()];
  return `${m} 个月 ${d} 天 · 周${wk}`;
}

export type Src = 'voice' | 'manual';
export type Ev = {
  id: number; type: Kind; start: string; end?: string; by: string; src: Src; cont?: boolean;
  sub?: 'formula' | 'bm' | 'breast' | 'pee' | 'poop' | 'both'; ml?: number; v?: number; site?: string;
  name?: string; times?: number; cm?: number; kg?: number; mins?: number;
};

export const EVENTS: Ev[] = [
  { id: 1, type: 'sleep', start: '00:00', end: '01:15', by: '妈妈', src: 'voice', cont: true },
  { id: 2, type: 'feed', sub: 'formula', ml: 180, start: '01:20', by: '妈妈', src: 'voice' },
  { id: 3, type: 'sleep', start: '01:40', end: '04:15', by: '妈妈', src: 'voice' },
  { id: 4, type: 'diaper', sub: 'pee', start: '04:20', by: '妈妈', src: 'manual' },
  { id: 5, type: 'feed', sub: 'formula', ml: 160, start: '04:30', by: '妈妈', src: 'voice' },
  { id: 6, type: 'sleep', start: '04:50', end: '07:20', by: '爸爸', src: 'voice' },
  { id: 7, type: 'diaper', sub: 'both', start: '07:25', by: '爸爸', src: 'manual' },
  { id: 8, type: 'feed', sub: 'formula', ml: 170, start: '07:40', by: '爸爸', src: 'voice' },
  { id: 11, type: 'temp', v: 36.9, site: '腋温', start: '07:30', by: '爸爸', src: 'manual' },
  { id: 9, type: 'sleep', start: '08:20', end: '09:35', by: '奶奶', src: 'voice' },
  { id: 12, type: 'water', ml: 20, start: '09:05', by: '奶奶', src: 'manual' },
  { id: 10, type: 'diaper', sub: 'pee', start: '09:40', by: '奶奶', src: 'manual' },
];

export type Reminder = { id: number; cat: 'med' | 'visit' | 'vax' | 'check'; t: string; when: string; rep?: string; note?: string; done?: boolean };
export const REMINDERS: Reminder[] = [
  { id: 1, cat: 'med', t: '喂维生素 D', when: '今天 10:30', rep: '每天', note: '妈妈设置' },
  { id: 2, cat: 'vax', t: '流感疫苗 第 2 剂', when: '11/3 周二 09:00', note: '社区卫生服务中心 · 带接种本' },
  { id: 3, cat: 'visit', t: '儿保门诊复查', when: '11/12 周四 14:00', note: '带上接种本和最近的体温记录' },
  { id: 4, cat: 'check', t: '8 月龄体检', when: '11/28 周六 上午', note: '同天可能有麻腮风、乙脑（以接种本为准）' },
  { id: 5, cat: 'visit', t: '急疹后复查', when: '10/22 周四', done: true, note: '医生说恢复得很好（家长转述）' },
];

export const SAMPLES = [
  '十点喝了 120 毫升奶，拉了一次', '刚喂了一瓶奶', '刚刚睡着了', '九点五十换了尿布，尿了', '刚才那次是 150 不是 120',
  '刚喝了 30 毫升水', '38度5，刚吃了一次退烧药', '脸上起了几个小红点', '明天下午三点提醒我喂药', '下周二打疫苗',
];

/* 卡片目录（原型 app6 CARDS） */
export const CARDS: Record<Kind, { n: string; ic: IconName; mood: 'full' | 'sleep' | 'shy' | 'happy' | 'idle' | 'worry'; acc: string[] }> = {
  feed: { n: '喂奶', ic: 'bottle', mood: 'full', acc: ['bottle'] },
  sleep: { n: '睡眠', ic: 'sleep', mood: 'sleep', acc: ['cap'] },
  diaper: { n: '尿布', ic: 'diaper', mood: 'shy', acc: [] },
  pee: { n: '尿尿', ic: 'drop', mood: 'shy', acc: [] },
  poop: { n: '便便', ic: 'poop', mood: 'shy', acc: [] },
  water: { n: '喝水', ic: 'cup', mood: 'happy', acc: ['bottle'] },
  med: { n: '吃药', ic: 'pill', mood: 'idle', acc: ['chart'] },
  temp: { n: '体温', ic: 'thermo', mood: 'idle', acc: ['thermo'] },
  symptom: { n: '症状', ic: 'rash', mood: 'worry', acc: ['chart'] },
  growth: { n: '身高体重', ic: 'ruler', mood: 'happy', acc: ['sprout'] },
  bath: { n: '洗澡', ic: 'bath', mood: 'happy', acc: [] },
};
export const DEF_CARDS: Kind[] = ['feed', 'sleep', 'diaper', 'water', 'med', 'temp'];
export const TYPE_IC: Record<Kind, IconName> = {
  feed: 'bottle', sleep: 'sleep', diaper: 'diaper', pee: 'diaper', poop: 'diaper', water: 'cup',
  med: 'pill', temp: 'thermo', symptom: 'rash', growth: 'ruler', bath: 'bath',
};
export const LVACC: string[][] = [[], ['egg'], [], ['sprout'], ['flower'], ['flower', 'crown']];
