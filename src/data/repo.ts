/* =========================================================
   数据访问层（Repository）
   - 界面只依赖 Repo 接口，不直接碰存储。
   - 现在用 LocalRepo（AsyncStorage：iOS/Android 为本地存储，Web 为 localStorage）。
   - M2 云端版：新增 SupabaseRepo implements Repo（同样的方法签名，records / babies /
     members 三张表），在下面的 getRepo() 里按「是否登录」切换即可；界面代码不用改。
   ========================================================= */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Baby, BabyRecord, Member, NewRecord, RecordValues, Settings } from './types';
import { DEF_CARDS } from './mock';

export interface Repo {
  getBaby(): Promise<Baby | null>;
  saveBaby(b: Baby): Promise<void>;
  listRecords(babyId: string): Promise<BabyRecord[]>;
  addRecord(r: NewRecord): Promise<BabyRecord>;
  updateRecord(id: string, patch: Partial<Pick<BabyRecord, 'time' | 'endTime' | 'note' | 'type'>> & { values?: RecordValues }): Promise<BabyRecord>;
  deleteRecord(id: string): Promise<void>;
  /** 批量写入（演示数据种子用） */
  replaceRecords(babyId: string, rs: BabyRecord[]): Promise<void>;
  getMembers(): Promise<Member[]>;
  getSettings(): Promise<Settings>;
  saveSettings(patch: Partial<Settings>): Promise<Settings>;
  /** 清空本机全部数据（回到首次启动） */
  clearAll(): Promise<void>;
}

export const DEFAULT_SETTINGS: Settings = { consentAt: null, onboarded: false, night: false, cards: DEF_CARDS, sample: 0, lvl: 3, xp: 37, demoSeeded: false };
export const LOCAL_MEMBER: Member = { id: 'local', name: '妈妈', role: 'admin', isLocal: true };

const K = { baby: 'yj:v1:baby', records: 'yj:v1:records', settings: 'yj:v1:settings', members: 'yj:v1:members' };
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export class LocalRepo implements Repo {
  private cache: BabyRecord[] | null = null;
  private async read<T>(k: string, d: T): Promise<T> { const s = await AsyncStorage.getItem(k); return s ? (JSON.parse(s) as T) : d; }
  private write(k: string, v: unknown) { return AsyncStorage.setItem(k, JSON.stringify(v)); }
  private async all() { if (!this.cache) this.cache = await this.read<BabyRecord[]>(K.records, []); return this.cache; }
  private async flush() { await this.write(K.records, this.cache ?? []); }

  getBaby() { return this.read<Baby | null>(K.baby, null); }
  saveBaby(b: Baby) { return this.write(K.baby, b); }
  async listRecords(babyId: string) { return (await this.all()).filter(r => r.babyId === babyId); }
  async addRecord(r: NewRecord) {
    const now = new Date().toISOString();
    const rec: BabyRecord = { ...r, id: uid(), createdAt: now, updatedAt: now };
    (await this.all()).push(rec); await this.flush(); return rec;
  }
  async updateRecord(id: string, patch: Parameters<Repo['updateRecord']>[1]) {
    const list = await this.all(); const i = list.findIndex(r => r.id === id);
    if (i < 0) throw new Error('record not found');
    const cur = list[i];
    const next: BabyRecord = { ...cur, ...patch, values: patch.values ? { ...patch.values } : cur.values, updatedAt: new Date().toISOString() };
    list[i] = next; await this.flush(); return next;
  }
  async deleteRecord(id: string) { this.cache = (await this.all()).filter(r => r.id !== id); await this.flush(); }
  async replaceRecords(babyId: string, rs: BabyRecord[]) { this.cache = [...(await this.all()).filter(r => r.babyId !== babyId), ...rs]; await this.flush(); }
  async getMembers() { return this.read<Member[]>(K.members, [LOCAL_MEMBER]); }
  async getSettings() { return { ...DEFAULT_SETTINGS, ...(await this.read<Partial<Settings>>(K.settings, {})) }; }
  async saveSettings(patch: Partial<Settings>) { const s = { ...(await this.getSettings()), ...patch }; await this.write(K.settings, s); return s; }
  async clearAll() { this.cache = null; await AsyncStorage.multiRemove(Object.values(K)); }
}

let repo: Repo | null = null;
/** 唯一入口。M2 云端：if (session) return new SupabaseRepo(session) */
export function getRepo(): Repo { if (!repo) repo = new LocalRepo(); return repo; }
