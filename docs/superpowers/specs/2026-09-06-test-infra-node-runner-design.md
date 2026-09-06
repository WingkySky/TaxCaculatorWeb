# 测试基建：Node 直跑回归门设计

日期：2026-09-06
状态：已与用户确认（方案 A：零依赖 Node 直跑 + 测试单源）

## 背景与问题

- 94 项自检寄生在 `js/self-tests.js` 页面内，回归门每次都要起 http 服务器开浏览器，拖慢任何后续重构（尤其 page-batch 瘦身）。
- 真正的覆盖空白：批量计税流水线（`processWithMapping` 端到端、兜底链、年终奖行）与导出器组装层（`buildSalaryFormulaGrid` 边界）。
- 框架/性能层面无需优化：无依赖、体量小，不在此讨论。

## 可行性探针（已验证，2026-09-06）

Node 24 + 约 30 行环境桩（`window = globalThis`、宽松 document element 桩、location/navigator）+ 按 index.html 顺序 require 源文件，`TaxTest.runSelfTests()` **94/94 通过，源码零改动**。

两个实测发现，已吸收进方案：

1. `page-batch.js` 模块顶层即绑定拖拽事件 → 桩必须宽松（`getElementById` 返回 no-op element），不能是「碰到就抛错」的严格桩。
2. 漏加载外置政策种子 `tax-policy-data.js` 时 23 项政策库断言失败（71/94）→ 加载清单必须含它。

探针产物为临时脚本（%TEMP%），不落仓库；正式运行器按本规格实施。

## 目标

- `node tests/run.js` 一条命令秒级回归，无需浏览器。
- 断言单源：浏览器 console 自检与 Node 跑同一份，双端同源零重复。
- 补齐批量流水线与导出器组装的覆盖缺口，为后续 page-batch 重构上保险。

## 方案

### 1. 运行器 `tests/run.js`（零依赖 CommonJS）

- **环境桩（约 30 行）**：`window = globalThis`；`stubEl()` 宽松 element（`addEventListener/removeEventListener/classList.{add,remove,toggle}/style/value/checked/files/innerHTML/textContent/appendChild/querySelector/querySelectorAll/click` 全 no-op）；`document.{getElementById,querySelector,querySelectorAll,createElement,body}`；`location/navigator` 最小桩。头部注释注明维护约定：**源码加载期用到新 DOM API 时补桩，不改源码**。
- **加载清单（13 个文件，按 index.html 真实顺序的子集）**：`tax-policy-data` → `js/state` → `js/utils` → `js/tax-engine` → `js/policy-library` → `js/social-insurance` → `js/exporter` → `js/ui` → `js/page-shared` → `js/page-multi` → `js/page-batch` → `js/page-params` → `js/self-tests`。不含 `page-policy`/`page-rules`/`app`（测试不需要，减少 DOM 面；不加载 app.js，页面侧的自动执行逻辑不会触发，Node 显式调用入口）。
- **执行与退出码**：调 `TaxTest.runAll()`，逐套件打印汇总（三行「🧪 套件名：x/y 通过」+ 总计行），任一失败打印明细并以退出码 1 结束，全绿退出码 0。

### 2. 测试组织（单源双端）

- `js/self-tests.js` 现有 94 项断言**原样保留，名字一条不丢**；新增 `runBatchPipelineTests()` 与 `runExporterTests()` 两个套件函数。
- `window.TaxTest` 接口扩为 `{ runSelfTests, runBatchPipelineTests, runExporterTests, runAll }`；`runAll()` 返回聚合 `{ passed, total, suites }`。
- 页面加载自动执行改为 `runAll()`（调用点在 `js/app.js` init 末尾，改一行）：console 分三组输出，格式与现状一致。
- 断言工具（`eq`/`isTrue`）与「保存→改→恢复 `salaryParams`」的夹具模式沿用现有实现。
- README 中「94 项自检」表述按实施后实际总数回填。

### 3. 新增缺口测试

**批量计税流水线（≥15 条，对 `PageBatch` 已导出的核心函数）：**

- `processWithMapping` 端到端：合成多行数据（姓名/月份/应发工资/社保基数/公积金比例/专项附加/年终奖/城市列）→ 断言列映射识别、逐行税额与引擎直算一致、同人跨月累计链、跨年重置。
- 兜底链：行内列 > 整批设置 > 工资参数；全缺记 0 并标注；勾选「按应发工资作基数」时按城市上下限 clamp。
- 年终奖：人 × 年单独行插入且不进累计链；税后反算方向下并入对比不适用。
- 劳务批量：断月重置开关生效；2025-10 前后新旧政策行标注（旧行不扣税）。

**导出器组装（≥8 条，对 `Exporter.buildSalaryFormulaGrid` 等纯函数，不碰 XLSX/CDN IO）：**

- 反算方向网格；公积金比例档公式；多人同月与跨年累计基准；年终奖并入/单独两种方案的公式差异；派生列公式与缓存值成对性。

实施时以源码实际函数签名为准——本规格锁定意图与验收，不锁内部 API 名。

## 边界（不做的）

- **不改被测源码**（`js/state|utils|tax-engine|policy-library|social-insurance|exporter|ui|page-shared|page-multi|page-batch|page-params`；原则：改桩不改源码，实施中发现加载期 DOM 依赖一律在桩侧吸收）。允许的 js 改动仅限两处非被测文件：`js/self-tests.js`（本规格改动对象）与 `js/app.js` 自检入口调用一行（init 末尾 `TaxTest.runSelfTests()` → `TaxTest.runAll()`）。
- 不引入测试框架 / node_modules / package.json；不做覆盖率与 CI。
- UI/DOM 行为不进 Node 测试——浏览器冒烟清单维持现有流程（人工 + IAB，见记忆 taxcalc-browser-verification）。

## 测试与验收

1. `node tests/run.js`：Git Bash 与 PowerShell 各跑一次，全绿退出码 0。
2. file:// 双击打开 index.html：console 三组自检全过，总数与 Node 端一致。
3. 原 94 项断言名集合与实施前 diff 比对，一条不丢。
4. 新增断言：批量流水线 ≥15 条、导出器 ≥8 条。
5. README 回归门章节更新（命令 + 实际总数）。

## 影响文件

| 文件 | 改动 |
| --- | --- |
| `tests/run.js` | 新增：环境桩 + 源文件按序加载 + runAll 调用 + 退出码 |
| `js/self-tests.js` | 新增两套件函数、TaxTest 接口扩展；原 94 项不动 |
| `js/app.js` | 仅 init 末尾自检入口调用一行：`runSelfTests()` → `runAll()` |
| `README.md` | 回归门说明与自检总数更新 |

## 实施记录（2026-09-06）

已实施并验收通过：

- 总量 126 项 = 计税与政策库 94 + 批量计税流水线 22 + 导出器组装 10（目标 ≥15/≥8，实际 22/10）。
- `node tests/run.js` 在 Git Bash 与 PowerShell 均全绿退出码 0；file://（Edge 无头加载 `file:///`）经 app.js 自动执行 runAll，三套件全绿。
- 断言名 diff 核对：`runSelfTests` 函数体零改动，原 94 项一条未丢；仅导入区扩展与文件头注释更新。
- 被测源码零改动（页面侧 DOM 绑定由运行器宽松桩吸收）。实施中发现 Node 24 的 `navigator` 全局只读（strict 模式赋值抛错），而源码仅在剪贴板函数用到 navigator 且测试不触碰——运行器因此不桩 navigator。
