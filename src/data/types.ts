/* 数据模型 —— 本地与（将来的）云端共用。字段命名与 PRD「技术架构」里的 records 表保持一致，M2 接 Supabase 时一一映射。 */
import type { Kind } from '@/theme/tokens';

/** 真正落库的记录类型（尿尿 / 便便卡片写入的是 diaper + sub） */
export type RecordType = Exclude<Kind, 'pee' | 'poop'>;
export type FeedSub = 'formula' | 'bm' | 'breast';
export type DiaperSub = 'pee' | 'poop' | 'both';

export type RecordValues = {
  sub?: FeedSub | DiaperSub;
  ml?: number | null;      // 喂奶 / 喝水
  mins?: number;           // 亲喂时长 / 洗澡时长
  v?: number;              // 体温 ℃
  site?: string;           // 腋温 / 耳温 / 额温
  name?: string;           // 药名 / 症状
  times?: number;          // 用药次数
  cm?: number; kg?: number;
};

export type BabyRecord = {
  id: string;
  babyId: string;
  type: RecordType;
  time: string;            // ISO，开始时间
  endTime?: string | null; // ISO，睡眠结束；null = 进行中
  values: RecordValues;
  note?: string;
  createdBy: string;       // 记录人显示名（妈妈 / 爸爸 / 奶奶）
  src: 'voice' | 'manual';
  createdAt: string;
  updatedAt: string;
};
export type NewRecord = Omit<BabyRecord, 'id' | 'createdAt' | 'updatedAt'>;

export type Gender = 'girl' | 'boy';
export type AvatarKey = 'baby' | 'sprout' | 'flower' | 'crown' | 'cap' | 'bottle';
export type Baby = { id: string; name: string; birthday: string /* YYYY-MM-DD */; gender: Gender; avatar: AvatarKey; feeding: FeedSub };

export type Member = { id: string; name: string; role: 'admin' | 'recorder' | 'viewer'; isLocal: boolean };

export type Settings = {
  consentAt: string | null;   // 同意隐私政策 / 用户协议的时间
  onboarded: boolean;
  night: boolean;
  cards: Kind[];
  sample: number;
  lvl: number; xp: number;
  demoSeeded: boolean;
  /** 团团建议里点了「知道了」的条目（本机） */
  sgGone?: string[];
  /** 首次使用：空首页的团团引导已关闭 / 「邀请家人」提示卡已关闭 / 第一条记录的庆祝已出现过 */
  guideDone?: boolean;
  nudgeGone?: boolean;
  firstDone?: boolean;
};

/* —— M4 健康 —— */
export type Visit = { id: string; time: string /* ISO */; title: string; note?: string };
export type Episode = {
  id: string; babyId: string; title: string; startDate: string /* YYYY-MM-DD */; endDate: string | null;
  status: 'active' | 'recovered'; visits: Visit[]; note?: string; createdBy: string; createdAt: string; updatedAt: string;
};
export type Allergy = { id: string; babyId: string; name: string; note?: string; createdBy: string; createdAt: string; updatedAt: string };
export type Vaccine = { id: string; babyId: string; name: string; date: string /* YYYY-MM-DD */; note?: string; createdBy: string; createdAt: string; updatedAt: string };
export type RemCat = 'med' | 'visit' | 'vax' | 'check' | 'temp';
export type Reminder = {
  id: string; babyId: string; cat: RemCat; title: string; dueAt: string /* ISO，第一次到点 */; repeat: 'none' | 'daily' | 'weekly';
  note?: string; source: 'user' | 'plan' | 'suggest'; planKey?: string; confirmed: boolean;
  doneAt: string | null; doneBy: string | null; createdBy: string; createdAt: string; updatedAt: string;
};
export type HealthKind = 'episodes' | 'allergies' | 'vaccines' | 'reminders';
export type HealthData = { episodes: Episode[]; allergies: Allergy[]; vaccines: Vaccine[]; reminders: Reminder[] };
