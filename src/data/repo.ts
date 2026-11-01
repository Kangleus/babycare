/* =========================================================
   数据访问层（Repository）唯一入口
   - 界面只依赖 Repo 接口，不直接碰存储。
   - getRepo() 返回 SupabaseRepo：本地优先（LocalRepo），登录并加入家庭后自动同步到 Supabase；
     没登录时它的行为和 LocalRepo 完全一样，App 不登录也能完整使用。
   ========================================================= */
import { SupabaseRepo } from './supabase-repo';
import type { Repo } from './local-repo';

export { DEFAULT_SETTINGS, LOCAL_MEMBER, LocalRepo, uid } from './local-repo';
export type { Repo } from './local-repo';

let repo: SupabaseRepo | null = null;
export function getRepo(): Repo { if (!repo) repo = new SupabaseRepo(); return repo; }
/** 同步引擎需要直接改本地副本 */
export function getLocalStore(): SupabaseRepo { getRepo(); return repo!; }
