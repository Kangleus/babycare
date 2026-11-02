# 团子育儿本

按住团子说一句话，就能记下宝宝的喂奶、睡觉、尿布、体温和用药；家人共享一份记录，**只记录、不诊断**。

- 在线体验（网页版）：https://kangleus.github.io/babycare/
- 技术栈：Expo SDK 58 / React Native（expo-router）+ Supabase + 阿里云百炼（语音/问答）
- 视觉标准：`docs/prototype/index.html`（唯一视觉真源，改界面先在这里找对应样式）

![首页与记录流程](shots/m1-showcase.png)

## 快速开始

```bash
npm ci                    # 装依赖
npm run setup:test        # 建测试用 venv + 装 Playwright（一台机器只需一次）
npx expo start --web      # 开发预览
```

跑全套验收测试（会自动构建网页版、起静态服务、跑完收尾）：

```bash
npm run test:web
```

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run typecheck` | TypeScript 类型检查（`tsc --noEmit`） |
| `npm run lint` | ESLint（`expo lint`） |
| `npm run test:web` | 构建 + 跑 4 套网页版验收测试，末尾汇总视觉差异 |
| `npm run e2e` / `npm run e2e:m4` | 只跑某一套（需先 `npm run serve:web`） |
| `npm run check:mascot` / `npm run check:night` | 团团动画 / 夜间星星的像素级核对 |
| `npm run check:secrets` | 提交前扫一遍，防止密钥和备份进仓库 |
| `npm run backup:db` | 导出数据库备份（需要 `SUPABASE_DB_URL`） |
| `npm run build:web` | 导出网页版到 `dist/` |

测试脚本通过环境变量配置，不再写死机器路径：`E2E_BASE_URL`、`E2E_SHOTS_DIR`、`CHROME_PATH`、
`ENV_TEST_FILE`、`VISUAL_WARN_PCT`、`VISUAL_STRICT`（说明见 `tools/paths.py` 顶部）。

## 目录

```
src/app/         页面路由（expo-router：今天 / 健康 / 问团子 / 我的）
src/components/  界面组件（按原型一比一实现）
src/data/        数据层：LocalRepo（本地）/ SupabaseRepo（云端）+ 同步引擎
src/state/       全局状态与 hooks
supabase/        migrations（含 RLS 与 RPC）+ Edge Function（voice-parse）
tools/           验收测试、截图工具、语音评测、备份脚本
docs/            HANDOFF（交接）、DATA（数据层）、CLOUD（云端）、BACKUP（备份）、prototype（视觉原型）
shots/           各阶段截图与原型对比图
```

## 文档

- [`docs/HANDOFF.md`](docs/HANDOFF.md) —— **接手先读这个**
- [`docs/DATA.md`](docs/DATA.md) —— 本地数据层与趋势算法
- [`docs/CLOUD.md`](docs/CLOUD.md) —— Supabase 表结构、RLS、RPC、同步
- [`docs/BACKUP.md`](docs/BACKUP.md) —— 数据库备份（免费版没有自动备份）

## 硬规则

1. **样式必须和原型一模一样**：`docs/prototype/index.html` 是唯一视觉标准，改完截图并排对比。
2. **医疗安全**：不诊断、不给用药剂量、不给喂水量；体温 ≥37.5℃ 标「偏高」，≥38℃ 提示及时就医，急症直接让就医。
3. **密钥绝不进代码 / 仓库 / 日志**：App 端只有 Supabase publishable key；第三方 AI key 只放 Supabase Edge Function secrets。
4. **已有测试不能回退**：每个阶段尽早小步 commit，push 前先确认。

## 免责声明

本项目是记录工具，**不提供医疗建议**，不能替代医生诊断。任何健康问题请及时就医。
