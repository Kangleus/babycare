/* 示例模式（只读）：豆米的演示数据全部在内存里生成，
   永不落盘、不同步、不调用任何 Edge Function。
   任何写操作直接抛 DemoReadonlyError —— 界面层应该先拦下来弹 toast，
   这里的 throw 是最后一道兜底，防止将来有人漏加了守卫还没发现。

   唯一允许落盘的是「夜间模式」：写到已有的 yj:v1:settings 里（不新增 key），
   否则用户在欢迎页切了夜间、一进注册就变回白天，看着像 bug。 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Repo } from './local-repo';
import { DEFAULT_SETTINGS, K, LOCAL_MEMBER } from './local-repo';
import type { Baby, BabyRecord, HealthData, HealthKind, Member, NewRecord, Settings } from './types';
import { buildDemo, buildDemoHealth } from './seed';

export class DemoReadonlyError extends Error {
  constructor() { super('DEMO_READONLY'); this.name = 'DemoReadonlyError'; }
}
const no = (): never => { throw new DemoReadonlyError(); };

export const DEMO_BABY = (): Baby => ({ id: 'demo-baomi', name: '豆米', birthday: '2026-03-28', gender: 'girl', avatar: 'baby', feeding: 'formula' });

export class DemoRepo implements Repo {
  private baby: Baby = DEMO_BABY();
  private records: BabyRecord[];
  private health: HealthData;
  private settings: Settings = DEFAULT_SETTINGS;

  constructor(private now: Date = new Date()) {
    this.records = buildDemo(this.baby.id, now);
    this.health = buildDemoHealth(this.baby, now);
  }

  /* —— 读 —— */
  async getBaby() { return this.baby; }
  async listRecords() { return this.records; }
  async getMembers(): Promise<Member[]> {
    return [
      { id: 'demo-mom', name: '妈妈', role: 'admin', isLocal: true },
      { id: 'demo-dad', name: '爸爸', role: 'admin', isLocal: false },
      { id: 'demo-granny', name: '奶奶', role: 'recorder', isLocal: false },
    ];
  }
  async getSettings() { return this.settings; }
  async getHealth() { return this.health; }

  /* —— 写：一律拒绝 —— */
  async saveBaby(): Promise<void> { no(); }
  async addRecord(_r: NewRecord): Promise<BabyRecord> { return no(); }
  async updateRecord(): Promise<BabyRecord> { return no(); }
  async deleteRecord(): Promise<void> { no(); }
  async replaceRecords(): Promise<void> { no(); }
  async putHealth<T extends HealthKind>(_k: T, _i: HealthData[T][number]): Promise<HealthData[T][number]> { return no(); }
  async deleteHealth(): Promise<void> { no(); }
  async replaceHealth(): Promise<void> { no(); }
  async clearAll(): Promise<void> { no(); }

  /** 只允许改「夜间模式」这一项，且写回已有的 settings key（不新增存储项） */
  async saveSettings(patch: Partial<Settings>): Promise<Settings> {
    this.settings = { ...this.settings, ...patch };
    if ('night' in patch) {
      try {
        const raw = await AsyncStorage.getItem(K.settings);
        const cur = raw ? (JSON.parse(raw) as Settings) : DEFAULT_SETTINGS;
        await AsyncStorage.setItem(K.settings, JSON.stringify({ ...cur, night: this.settings.night }));
      } catch { /* 存不了也不影响使用 */ }
    }
    return this.settings;
  }
}

export const demoMember = () => LOCAL_MEMBER;
