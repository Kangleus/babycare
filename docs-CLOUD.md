# 一句记 · 云端同步（M2 / Supabase 项目「Baby」）

项目：`wzfbdvlmkoeftvtnmiex`（ap-southeast-1）。客户端只用 publishable key（`src/data/cloud-config.ts`，可用
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 覆盖），**App 里没有任何 service / secret key**。

## 数据库（supabase/migrations）
| 表 | 说明 |
|---|---|
| profiles | 账号资料（只能看/改自己） |
| families | 家庭；成员可读，管理员可改名 |
| family_members | 成员：role admin/member，display_name（妈妈/爸爸…）；只能改自己的称呼，不能自升管理员 |
| babies | 宝宝（id 用 App 本地 id，text），家庭成员可读写，管理员可删 |
| records | 记录：本地 Record 全字段 + created_by / created_by_name（触发器强制为当前用户和他在家里的称呼，不能冒充）+ updated_at / deleted_at（软删除，用于同步） |
| card_settings | 每个宝宝的首页卡片 |
| family_invites | 6 位邀请码、48 小时过期、一次性；客户端不能直接写，只能走 RPC |

- 每张表开 RLS：只有家庭成员能读写该家庭数据；anon 无任何表权限。
- RPC（`private` schema 里的 SECURITY DEFINER 函数 + `public` 同名包装）：`create_family`、`create_invite`、
  `accept_invite`（校验码、过期、已用；每人每小时最多 20 次尝试）、`delete_account`。
- Realtime：`records` 加入 `supabase_realtime` publication，按 `baby_id` 订阅（同样受 RLS 约束）。
- Advisors（security + performance）：0 条。

## 客户端
- `src/data/repo.ts` → `getRepo()` 返回 `SupabaseRepo`（本地优先，继承 `LocalRepo`）。没登录时行为和本地版完全一样。
- `src/data/sync.ts` 同步引擎：outbox（`yj:v1:outbox`）→ 推送；增量拉取（updated_at，5 秒重叠）；Realtime；
  首次连上家庭时上传本机真实记录（演示数据 `demo-*` 不传，按 id 去重）。
- 界面：我的 → 登录/注册（邮箱+密码）→ 创建我们家 / 我有邀请码；家庭成员（真实成员）；邀请家人（6 位码 + 有效期 + 分享文字）；
  加入家庭；退出登录；注销账号（两步确认）。每条记录显示「谁记的」。

## 需要在 Supabase 控制台做的事
1. **邮件**：内置邮件服务只给本组织成员的邮箱发信，而且每小时只能发很少几封（超了会报 429 `over_email_send_rate_limit`）。
   上线前二选一：
   - Authentication → Emails → SMTP Settings 配置自定义 SMTP（推荐，如 Resend / 阿里云邮件推送 / SendGrid），再到 Rate Limits 调高发信上限；或
   - 内测阶段先在 Authentication → Sign In / Providers → Email 关闭 “Confirm email”（注册后直接登录，App 已支持）。
2. **URL Configuration**：Site URL 填正式 Web 地址；Redirect URLs 加 `yijuji://**`（原生 App 深链）和 Web 地址（本地调试 `http://localhost:8081/**`）。
3. （可选）Authentication → Emails → Templates 把验证邮件改成中文。
4. （可选）开启 Leaked password protection（Pro 套餐功能）。

## 测试
- `npm run e2e`：本地流程（不登录）74 项。
- `npm run test:cloud`：真实项目上 29 项（RLS、邀请、Realtime、注销）。`npm run test:cloud-ui`：两个浏览器账号的界面联调 16 项，截图在 `shots/m2-cloud/`。
- 测试账号用 `tools/sql/it_create_users.sql`（密码放在不进 git 的 `.env.test`）创建，跑完用 `tools/sql/it_cleanup.sql` 删除。
