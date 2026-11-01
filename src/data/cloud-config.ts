/* 云端项目配置（Supabase 项目「Baby」）。
   publishable key 是给客户端用的公开 key，可以放在代码里，权限全靠数据库 RLS；绝不能把 service_role / secret key 放进 App。
   换项目时用环境变量覆盖：EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY（构建时注入）。 */
export const CLOUD = {
  url: process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://wzfbdvlmkoeftvtnmiex.supabase.co',
  publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Em1Od8uQwNWaTkbilyWUgg_-0rverpH',
};
