# M5 第一步：一键摘要（给医生 / 给家人 · 近 1/3/7 天 · 照原型实现）

## 目标与成功标准

在 App 里补上原型已画好的「一键摘要」：选人（给医生/给奶奶）→ 选范围（近 1/3/7 天）
→「团团在写便签」过渡 → 便签（可换一种 / 存图片 / 分享文字）。
**纯模板生成，不调用任何 AI** —— 数字由代码算，句子由模板拼，零成本、不会瞎编。

验收标准：

1. `npm run typecheck`、`npm run expo lint` 全绿
2. 新增 `tools/e2e_m5.py` 并接入 `npm run test:web`，本地与 CI 全绿
3. 便签里的每个数字都能被 e2e **独立重算**对上
   （沿用 e2e.py 里 `expected_avg` 的"测试自己再算一遍"模式）
4. 医疗红线：便签全文不出现诊断、剂量、喂水量建议；两版底部都有"不含诊断"声明
5. 选择屏与原型做像素对比并打印差异，不许静默；便签屏因数据是真实的、
   不做像素对比，只做内容断言（理由见 D4）
6. HANDOFF 进度更新

## 先定的 5 个产品决策（默认按建议走，不认可请在审阅时说）

| # | 决策点 | 原型现状 | 默认方案 |
|---|---|---|---|
| D1 | 空状态 | 没画 | 范围内 0 条记录 → 便签显示"这几天还没有记录"，一个"去记一笔"按钮关闭弹层并提示 |
| D2 | 分享按钮 | 画了"只读链接 7 天失效" | 需要后端（只读令牌+过期+撤回），**v1 不做**。按钮降级为"复制文字 / 存图片"（现成能力） |
| D3 | 奶奶版"小叮嘱"行 | "冲奶水温 40℃（妈妈备注）"——没有妈妈备注字段 | 改用**今天的提醒事项**（吃药/复诊等，真实数据）；没有提醒就整行省略 |
| D4 | 医生版"想问医生的问题"三行 + 睡眠"夜醒由 1 次变为 2 次" | 原型里是写死的演示文案 | **v1 省略这两块**（变化检测写错了就是伪智能，留给问团子）。因此便签屏不做像素对比 |
| D5 | 健康页现有"给医生摘要" | 原型里它打开的也是新面板 | **M4 的 DoctorSheet 保持原样不动**（47 个 M4 测试不冒险），新面板只从两个新入口进 |

## 数据与计算（新文件 `src/lib/summary.ts`，纯函数）

复用现有设施：`dayEvs` / `totals` / `feedGap` / `predict` / `rangeAvg`
（`src/lib/calc.ts`）、`md` / `hhmm` / `ageText` / `startOfDay`
（`src/lib/time.ts`）、`health` 状态里的 episodes/allergies/vaccines/reminders。

窗口语义与原型一致：**近 N 天 = 今天 + 前面 N-1 个整天**
（原型 `rng=3 → 10/29–10/31`，10/31 是当天）。

- `summaryStats(records, now, N)`：窗口内 feeds/ml、睡眠时长、尿布/便便、喝水、
  体温（最高/最近/按天序列）、用药、症状；整天的日均
  （沿用"完整天不计今天、测量值不补 0"的现有规则）+ "今天到 HH:mm 已 X"
- 医生版行：喂养 / 睡眠 / 尿布 / 体温·用药（无则"近 N 天无发热、无用药记录"）/
  症状（有才显示）/ 健康档案（既往病程、过敏、疫苗、长期用药）
- 奶奶版行：喝奶（`feedGap` 算间隔 + 窗口内单次奶量中位数 + `predict().next` 下一顿）、
  睡觉（醒约 X 小时会犯困）、尿布（今天是否便便过）、小叮嘱（今天未完成的提醒事项）
- 所有医疗措辞沿用 `doctor.tsx` 现有安全文案（"家长记录，剂量以医嘱为准"等），
  不新写任何医疗判断

## 界面（新文件 `src/components/summary.tsx`）

严格对照原型 `.aud` / `.seg` / `.gen` / `.memo` / `.memo.big` 的数值
（已定位行号 1216–1264）：

- **SummarySheet**：三阶段 `pick → gen → memo`，本地 state
  - pick：标题"一键摘要"、副标"把豆米的记录整理成一张小便签"、
    给医生/给奶奶两个大按钮、近 1/3/7 天 Seg、"生成摘要便签"主按钮、
    底部"只陈述记录和统计，不写诊断结论"
  - gen：团团 + "团团在写便签…" + 说明小字，1.1 秒后进 memo（和原型 `sleep(1100)` 一致）
  - memo：便签视觉复用 `doctor.tsx` 的 memo 样式（胶带/网格/圆角/团团贴纸），
    底部三按钮 换一种 / 存图片 / 分享，加"包含宝宝信息"提示
- testID：`summary-open`（两处入口）、`sm-pick`、`sm-aud-doctor`、`sm-aud-granny`、
  `sm-range-1/3/7`、`sm-gen`、`sm-memo`、`memo-*` 行

接线（沿用现有 `trend`/`TrendSheet` 的全局状态模式）：

- `src/state/app-state.tsx`：加 `summaryOpen` + `openSummary()`/`closeSummary()`
- `src/app/_layout.tsx`：根节点渲染 `<SummarySheet/>`（和 RecordSheet/TrendSheet 并列）
- 入口 1：`src/app/ai.tsx` 标题行右侧加原型同款 `pillbtn`「一键摘要」
  （页面其余占位卡保持，问团子本体是第二步）
- 入口 2：`src/app/me.tsx` 第一个 List 里加 `Li`「一键摘要 · 给医生/给奶奶的小便签」

## 测试（新文件 `tools/e2e_m5.py`，本地、无账号）

- 流程：引导 → 问团子页入口打开 → 默认值断言（给医生/近 3 天）→ 切奶奶/切范围
  → 生成（等 `sm-memo`）→ **独立重算**便签数字（从 localStorage 读记录照
  `summary.ts` 同规则算）→ 医生版/奶奶版断言（标题、底部声明、体温用药行）
  → 换一种回 pick → 奶奶版生成 → 存图片（expect_download）→ 分享文字
  （沿用 e2e_m4 的去掉 `navigator.share` 手法，断言剪贴板）
  → 最后清空数据后重开 → 断言空状态文案
- 视觉：打开原型页调用 `openSummary()` / `openSummary('granny')` 截 pick 屏，
  与 App pick 屏并排像素对比，走 `paths.visual_report`
  （打印百分比，超 2% 会警告但默认不判失败；如实汇报结果，不悄悄加豁免）
- 接入：`tools/run_web_tests.py` 的 `DEFAULT_TESTS` 加入 `e2e_m5.py`；
  `package.json` 加 `"e2e:m5"` 脚本

## 改动文件清单

新增：`src/lib/summary.ts`、`src/components/summary.tsx`、`tools/e2e_m5.py`
修改：`src/state/app-state.tsx`、`src/app/_layout.tsx`、`src/app/ai.tsx`、
`src/app/me.tsx`、`tools/run_web_tests.py`、`package.json`、
`docs/HANDOFF.md`（进度 M5 拆分更新）

## 明确不做（本次范围外）

- 不写任何 Edge Function / 不接 AI（问团子是下一步）
- 不做只读分享链接、不做睡眠变化检测、不做"想问医生的问题"
- 不动 `DoctorSheet` 与 M4 的 47 个测试；不动健康页原型（那 5 处豁免保持原样）
- 不动语音、不动云同步

## 风险与预案

| 风险 | 预案 |
|---|---|
| pick 屏像素对比落在 2–3%（字体渲染级差异，首页就是这水平） | 如实打印警告并汇报；不因一次对比就调全局阈值或加豁免 |
| 便签数字和 e2e 重算对不上 | 先查跨零点睡眠和"完整天"边界，规则写进 `summary.ts` 注释；不把断言改成恒真 |
| gen 阶段 1.1s 定时在 CI 抖动 | e2e 用 `wait_for(state='visible', timeout=10s)` 等 `sm-memo`，不定死 1.1s |
| web 存图片 / 复制行为平台差异 | 复用 doctor.tsx 已验证的 `shareImage`/`shareText`；剪贴板断言沿用 e2e_m4 的确定性手法 |
| 和原型在细节上对不齐 | 数值以 `docs/prototype/index.html` 行号为准，逐条抄，不做二次设计 |

## 提交与节奏

2–3 个小 commit：
① `src/lib/summary.ts` + `summary.tsx` + 接线（每步 tsc/lint）
② `e2e_m5.py` + runner 接入（本机跑绿）
③ HANDOFF 更新

推 PR，CI 两个 job 全绿后再合（沿用这次建立的流程）。

工作量估计：半天。
交付物：两个入口可用的完整一键摘要 + 一份带数字核对的 e2e + CI 绿灯。
