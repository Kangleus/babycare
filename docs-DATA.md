# 一句记 · 数据层（M1 本地版）

- `src/data/types.ts`：`BabyRecord`（id, babyId, type, time, endTime, values, note, createdBy, src, createdAt, updatedAt）、`Baby`、`Member`、`Settings`。
- `src/data/repo.ts`：`Repo` 接口 + `LocalRepo`（AsyncStorage，键 `yj:v1:*`）。**`getRepo()` 是唯一入口**——M2 云端版在这里按登录态返回 `SupabaseRepo implements Repo`，UI 和 `src/state/app-state.tsx` 不需要改。
- `src/data/seed.ts`：豆米演示数据（今天 12 条 + 过去 13 天），只在首次完成引导时写入；「我的 › 重置演示数据」可重来。
- 页面只通过 `useApp()` 读写（addRecord / updateRecord / deleteRecord / saveBaby / resetDemo / clearAll）。
- 本版本不访问任何网络 / 后端。

预览：`npm run build:web && npm run serve:web`，浏览器开 http://localhost:8090（dist 需用静态服务器打开，直接双击 index.html 不行）。
测试：`npm run e2e`（390x844，Playwright）。
