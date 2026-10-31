/* 静态目录 / 演示文案（记录数据见 seed.ts，存储见 repo.ts） */
import type { IconName } from '@/lib/art';
import type { Kind } from '@/theme/tokens';

export type Reminder = { id: number; cat: 'med' | 'visit' | 'vax' | 'check'; t: string; when: string; rep?: string; note?: string; done?: boolean };
/* 提醒在 M4 接入；首页「吃药 · 下次 10:30」暂用原型的演示提醒 */
export const REMINDERS: Reminder[] = [
  { id: 1, cat: 'med', t: '喂维生素 D', when: '今天 10:30', rep: '每天', note: '妈妈设置' },
  { id: 2, cat: 'vax', t: '流感疫苗 第 2 剂', when: '11/3 周二 09:00', note: '社区卫生服务中心 · 带接种本' },
  { id: 3, cat: 'visit', t: '儿保门诊复查', when: '11/12 周四 14:00', note: '带上接种本和最近的体温记录' },
  { id: 4, cat: 'check', t: '8 月龄体检', when: '11/28 周六 上午', note: '同天可能有麻腮风、乙脑（以接种本为准）' },
  { id: 5, cat: 'visit', t: '急疹后复查', when: '10/22 周四', done: true, note: '医生说恢复得很好（家长转述）' },
];

/* 原型 app2 SAMPLES（含 app5 分组） */
export const SAMPLES: { text: string; note: string; g?: string }[] = [
  { text: '十点喝了 120 毫升奶，拉了一次', note: '一句话 → 拆成 2 条记录' },
  { text: '刚喂了一瓶奶', note: '缺少奶量 → 团团追问一句' },
  { text: '刚刚睡着了', note: '生成「进行中」的睡眠' },
  { text: '九点五十换了尿布，尿了', note: '口语时间解析' },
  { text: '刚才那次是 150 不是 120', note: '一句话修改上一条' },
  { text: '刚喝了 30 毫升水', note: '喝水 · 首页喝水卡同步' },
  { text: '38度5，刚吃了一次退烧药', note: '体温 + 用药 · 只记你说的', g: '健康' },
  { text: '脸上起了几个小红点', note: '症状 · 只记录不判断', g: '健康' },
  { text: '明天下午三点提醒我喂药', note: '创建用药提醒', g: '提醒' },
  { text: '下周二打疫苗', note: '创建疫苗提醒', g: '提醒' },
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
