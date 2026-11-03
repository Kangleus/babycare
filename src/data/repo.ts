/* =========================================================
   数据访问层（Repository）唯一入口
   - 界面只依赖 Repo 接口，不直接碰存储。
   - 实例由 AppStateProvider 决定（real = SupabaseRepo；demo = 只读的 DemoRepo），
     通过 setRepo() 注册；其它模块用 getRepo() 取同一个实例。
   ========================================================= */
import { SupabaseRepo } from './supabase-repo';
import { DemoRepo } from './demo-repo';
import type { Repo } from './local-repo';

export { DEFAULT_SETTINGS, LOCAL_MEMBER, LocalRepo, uid } from './local-repo';
export type { Repo } from './local-repo';
export { DemoReadonlyError } from './demo-repo';

let current: Repo | null = null;

/** 由 AppStateProvider 在每次模式切换时调用 */
export function setRepo(next: Repo) { current = next; }
/** 当前实例模式（示例模式为只读） */
export const repoIsDemo = () => current instanceof DemoRepo;

export function getRepo(): Repo {
  if (!current) current = new SupabaseRepo();
  return current;
}
/** 同步引擎需要直接改本地副本；示例模式下没有 SupabaseRepo，返回 null */
export function getLocalStore(): SupabaseRepo | null {
  const r = getRepo();
  return r instanceof SupabaseRepo ? r : null;
}
