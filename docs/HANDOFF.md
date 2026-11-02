# 团子育儿本 · 交接说明（2026-11-01）

> 原名「一句记」。给接手的开发者 / 编码智能体读。先读完本文件再动代码。

## 1. 产品是什么
面向国内爸妈的 AI 原生宝宝记录 App，目标是**以个人身份正式发行**（不是作品集）。核心：语音一句话记录 → 确认卡 → 入库；作息预测；基于自家记录的 AI 问答（问团子）；一键摘要（含给医生看的摘要）。拍照放二期。演示宝宝：豆米，2026-03-28 出生。

## 2. 硬性规则（必须遵守）
1. **样式必须和原型一模一样**：`docs/prototype/index.html` 是唯一视觉标准（团团圆团子吉祥物、配色、字体 Nunito / ZCOOL KuaiLe、确认卡）。任何新界面先在原型里找对应样式，逐像素对齐，改完截图并排对比。
2. **医疗安全**：不诊断、不给用药剂量、不给喂水量；体温 ≥37.5℃ 标「偏高」，≥38℃ 提示「及时就医」，急症直接让就医。AI 回答和解析都要遵守。
3. **密钥绝不进代码/仓库/日志**。App 端只有 Supabase publishable key（`src/data/cloud-config.ts`）。第三方 AI key 只放 Supabase Edge Function secrets。
4. 已有测试不能回退；每个阶段尽早小步 commit。push 前先请康乐确认。

## 3. 技术栈与结构
- React Native + Expo SDK 58，TypeScript，Expo Router，react-native-svg，动画用 RN Animated。
- 数据层可切换：`src/data/repo.ts` 的 `getRepo()` —— 未登录用 LocalRepo（本地），登录后用 SupabaseRepo；离线优先，outbox 队列每 15s 重试，records 开 Realtime。细节见 `docs/DATA.md`、`docs/CLOUD.md`。
- 后端：Supabase 项目「Baby」，ref `wzfbdvlmkoeftvtnmiex`，新加坡，免费版。表：profiles, families, family_members, babies, records, card_settings, family_invites, episodes, allergies, vaccines, reminders, ai 用量表。全部开 RLS；建家庭/邀请（6 位、48 小时、一次性）/注销账号走 SECURITY DEFINER RPC。迁移在 `supabase/migrations/`。
- 登录：邮箱 + 密码（Supabase 已关 Confirm email）。手机号登录暂不做。
- Edge Function `voice-parse`（`supabase/functions/`）：校验 JWT 与家庭成员身份 → 百炼 Fun-ASR（宝宝词热词，失败退 qwen3-asr-flash）→ qwen-flash 解析成记录 JSON → 失败退本地规则；每户每日 60 次上限。读 secret `DASHSCOPE_API_KEY`。
- 网页验收版：GitHub Pages https://kangleus.github.io/babycare/ （`gh-pages` 分支）。发布方法：临时把 `app.json` 的 `expo.experiments.baseUrl` 设为 `/babycare`，`npx expo export --platform web --output-dir <临时目录>`，复制 `index.html` 为 `404.html`，加 `.nojekyll`，推到 gh-pages，然后把 app.json 改回去。

## 4. 进度
- ✅ M0 骨架、M1 本地记录全功能、M2 本地 + 云端家庭同步、M4 健康 tab（病程/体温曲线/过敏/疫苗/提醒/给医生看摘要）。
- ✅ 改名「团子育儿本」（界面、权限文案、分享文案、prompt 已改；slug / bundle id / 包名未改，建议值 `tuanzi-yuerben` / `com.kangleus.tuanziyuerben`，首次上架前定）。
- 🟡 M3 语音：代码、确认卡、文字兜底、Edge Function 都完成并部署；**真实识别未跑通**，卡在：
  1. 阿里云账号欠费（Arrearage），需康乐充值；
  2. Supabase Dashboard → Baby → Edge Functions → Secrets 还没加 `DASHSCOPE_API_KEY`（需康乐手动加）。
  加好后跑 `node tools/voice/eval.mjs text` 和 `audio` 测真实准确率（本地规则：30/30，新说法 12/15）。
- 🟡 M5 拆成两步，第一步已完成：
  - ✅ **一键摘要**（`src/lib/summary.ts` + `src/components/summary.tsx`）：给医生 / 给奶奶两版，近 1/3/7 天；入口在「问团子」页右上角和「我的」页。**纯模板生成，不调用 AI**——数字全由代码算，句子按模板拼。便签可换一种 / 存图片 / 分享文字。原型的「只读分享链接」「想问医生的问题」「夜醒变化检测」按 docs/NEXT-PLAN.md 的 D2/D4 推迟，没做。
  - ⬜ **问团子 AI 问答**：未开始。新建 Edge Function，取最近 N 天自家记录汇总进上下文（暂不需要向量库），qwen-plus 回答，DeepSeek 备用；遵守医疗安全规则；每户每日次数上限（`ai_usage` 表的 `kind='ask'` 已就绪）。方案见技术规划页（下方链接）。
- 一键摘要的测试：`tools/e2e_m5.py`（24 项，含用 localStorage 记录**独立重算**便签数字）。选择屏与原型像素对比当前约 2.4%（字体渲染级，首页同水平）。
- ⬜ M6 打包：安卓 APK、iOS TestFlight（需苹果开发者账号 688 元/年）、真机测录音（iOS 录 WAV、Android 录 AAC，只过了类型检查）。
- 已知缺口：忘记密码、移除成员/转让管理员、冲突编辑是后写覆盖、网页提醒只在页面打开时触发。
- 上架合规（暂缓）：数据迁国内云、ICP/App 备案、软著、生成式 AI 相关登记（个人主体能否办待确认）、商标（第 9/42 类未查）。

## 5. 测试
- 一条命令跑全套（自动构建 + 起静态服务 + 收尾 + 汇总视觉差异）：`npm run setup:test`（每台机器一次）→ `npm run test:web`
  - 覆盖 `e2e.py`、`e2e_m4.py`、`check:mascot`、`check:night`，不需要账号和密钥
- 需要真实账号的：`npm run test:cloud`（Node，RLS/邀请/注销）、`npm run test:cloud-ui`（两账号界面联调）、`tools/e2e_m3.py`（语音，需 `.env.test` + 百炼 key）。这些**不进 CI**。
- 脚本不再写死机器路径：统一走 `tools/paths.py`，可用 `E2E_BASE_URL` / `E2E_SHOTS_DIR` / `CHROME_PATH` / `ENV_TEST_FILE` / `VISUAL_WARN_PCT` / `VISUAL_STRICT` 覆盖。
- 视觉对比不许静默：超过阈值（默认 2%）会打醒目警告并进 `test:web` 的汇总段；`VISUAL_STRICT=1` 时直接判失败。
- CI：`.github/workflows/ci.yml`，PR 上跑「类型检查 + Lint」和「网页版验收测试」两个 job。
- 云端测试需要 `.env.test`（gitignored，含测试账号密码，需自行创建测试账号，跑完清理）。

## 6. 参考资料
- 视觉原型：`docs/prototype/index.html`
- PRD v0.5（流程图、架构、M0–M6 排期）：https://cursor.com/canvas/store-17ad1f01-0c5a-49a5-aaa1-08149d67afbf/da9fff8b-f093-4d1e-91fa-a81da8f703aa
- M3/M5 技术规划（选型、成本、Key 申请）：https://cursor.com/canvas/store-17ad1f01-0c5a-49a5-aaa1-08149d67afbf/d70122e5-fcc1-42d8-8bab-0af9617463bd
- 截图：`shots/`（m1、m2、m2-cloud、m3、m4、rename）

## 7. 建议的下一步任务清单
1. 环境检查：node / npm / git、`npm install`、`npx expo start --web` 能跑。
2. 等康乐完成充值 + secret 后，测真实语音准确率，按失败用例调 prompt 和热词。
3. M5 问团子：Edge Function + 问答界面（严格按原型）+ 一键摘要。
4. 补忘记密码。
5. M6 打包与真机测试。
