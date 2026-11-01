# 团子育儿本 · 数据层（M1 本地版）

- `src/data/types.ts`：`BabyRecord`（id, babyId, type, time, endTime, values, note, createdBy, src, createdAt, updatedAt）、`Baby`、`Member`、`Settings`。
- `src/data/repo.ts`：`Repo` 接口 + `LocalRepo`（AsyncStorage，键 `yj:v1:*`）。**`getRepo()` 是唯一入口**——M2 云端版在这里按登录态返回 `SupabaseRepo implements Repo`，UI 和 `src/state/app-state.tsx` 不需要改。
- `src/data/seed.ts`：豆米演示数据（今天 12 条 + 过去 13 天），只在首次完成引导时写入；「我的 › 重置演示数据」可重来。
- 页面只通过 `useApp()` 读写（addRecord / updateRecord / deleteRecord / saveBaby / resetDemo / clearAll）。
- 本版本不访问任何网络 / 后端。

预览：`npm run build:web && npm run serve:web`，浏览器开 http://localhost:8090（dist 需用静态服务器打开，直接双击 index.html 不行）。
测试：`npm run e2e`（390x844，Playwright）。

## 趋势日均（M1 补）
- 范围内（7 / 30 天柱子）完整的天（今天未过完不计）：没有记录的天按 0 计；体温 / 体重是测量值，只平均有记录的天。
- 起点 = 这一类记录的第一条 与 开始使用（同意协议）这天，取更早者；更早的天不画柱、不计入日均和对比。
- 实现：`src/lib/calc.ts` 的 `rangeAvg` / `statsStart`。

## 动画
- 团团：Web 用原型 CSS（`src/lib/mascot-css.ts`）；iOS / Android 用 `src/lib/mascot.tsx`（RN Animated 原生驱动，分层 + transformOrigin，关键帧与 CSS 相同）。尊重系统「减少动态效果」。
- 夜间星星：`src/components/chrome.tsx` 的 `NightStars`（两端同一实现）+ `NightTint`。
- 校验：`npm run check:mascot`、`npm run check:night`、`npm run export:native`。
