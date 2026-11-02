# 数据库备份

## 为什么必须有

Supabase **免费版不提供自动备份**，只有付费版（Pro 及以上）才有每日备份。官方文档原话是：

> We automatically back up all Pro, Team, and Enterprise Plan projects on a daily basis. …
> We recommend that free tier plan projects regularly export their data using the
> [Supabase CLI `db dump` command](https://supabase.com/docs/guides/cli) and maintain off-site backups.

也就是说：现在这个项目一旦误删、误改，**没有任何东西可以恢复**。在真实用户进来之前，
必须能自己导出一份完整数据。

参考：<https://supabase.com/docs/guides/platform/backups>

## 怎么用

```bash
# 方式一：临时给一次（推荐，密码不落盘）
SUPABASE_DB_URL='postgresql://...' npm run backup:db

# 方式二：写进仓库根目录的 .env（已被 .gitignore，不进仓库）
npm run backup:db
```

产出：`backups/babycare-YYYYMMDD-HHMM.sql.gz`，权限自动设为 `600`。
脚本结束会打印导出的表数，可以和预期表数（当前 11 张业务表 + 若干辅助表）核对。

## 连接串从哪拿

Supabase Dashboard → 项目 **Baby** → **Project Settings → Database → Connection string**，
选 **Session pooler**（IPv4 可达，适合脚本），然后从这些片段拼出来：

| 片段 | 取值 |
|---|---|
| 主机 | `aws-0-<region>.pooler.supabase.com` |
| 端口 | `5432` |
| 用户 | `postgres.<project-ref>` |
| 密码 | Dashboard 上设置的数据库密码（不是 App 里的 publishable key） |
| 数据库 | `postgres` |

**不要把带密码的连接串贴进文档、截图、聊天记录或提交信息里。**

## pg_dump 版本规则

`pg_dump` 的主版本必须 **不低于** 数据库服务器的主版本，否则可能导出失败或导出不完整。
所以脚本的做法是：

1. 先连一次数据库，读 `server_version_num`，算出服务器主版本（Supabase 现在是 15 或 17）；
2. 本机有 `pg_dump` 且主版本够 → 用本机；
3. 否则用 **对应主版本** 的容器镜像，例如服务器是 17 就用 `postgres:17`。

**不会用裸 `postgres`（默认拉 latest）** —— 那样今天能导、明年可能就导不出来。

## 恢复

```bash
gzip -dc backups/babycare-20261102-0900.sql.gz | psql "$SUPABASE_DB_URL"
```

恢复会覆盖同名对象，**先在空项目或本地库演练一次**，别直接对生产库操作。

## 建议

- 现在（只有演示数据）：上真实用户之前至少导一次，确认脚本和权限都通。
- 有真实用户之后：每周一次；或直接升级付费版，用它的每日备份 + 时间点恢复。
- 备份文件含宝宝的作息与健康记录，属于敏感数据：`backups/` 已写进 `.gitignore`，
  也别随手发到聊天工具里。
