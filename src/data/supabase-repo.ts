/* SupabaseRepo：界面拿到的仓库。读写都先走本地（离线可用），写完把变化交给同步引擎排队上云；
   没登录 / 没加入家庭时 cloud.enqueue 什么都不做，等同于 LocalRepo。 */
import { LocalRepo, Repo } from './local-repo';
import { cloud } from './sync';
import type { Baby, HealthData, HealthKind, NewRecord, Settings } from './types';

export class SupabaseRepo extends LocalRepo implements Repo {
  async addRecord(r: NewRecord) { const rec = await super.addRecord(r); cloud.enqueue({ k: 'rec', id: rec.id }); return rec; }
  async updateRecord(id: string, patch: Parameters<Repo['updateRecord']>[1]) { const rec = await super.updateRecord(id, patch); cloud.enqueue({ k: 'rec', id }); return rec; }
  async deleteRecord(id: string) { await super.deleteRecord(id); cloud.enqueue({ k: 'rec', id }); }
  async saveBaby(b: Baby) { await super.saveBaby(b); cloud.enqueue({ k: 'baby' }); }
  async putHealth<T extends HealthKind>(kind: T, item: HealthData[T][number]) { const r = await super.putHealth(kind, item); cloud.enqueue({ k: 'h', t: kind, id: item.id }); return r; }
  async deleteHealth(kind: HealthKind, id: string) { await super.deleteHealth(kind, id); cloud.enqueue({ k: 'h', t: kind, id }); }
  async saveSettings(patch: Partial<Settings>) { const s = await super.saveSettings(patch); if ('cards' in patch) cloud.enqueue({ k: 'cards' }); return s; }
}
