# 打印/PDF 报告设计（正式报告）

日期：2026-09-06
状态：已与用户确认（视觉伴侣草图选定：分节正式式版式 + 批量逐人工资条块）

## 背景与目标

计算结果目前只能导出 CSV/Excel 公式版（专业向溯源用），缺少「可打印、可留档、可转发给别人看」的正式输出。本特性为三类结果区提供一键打印报告，浏览器打印对话框内可「另存为 PDF」。

约束：零依赖（`@media print` CSS + `window.print()`，不用 PDF 生成库）；file:// 与挂网行为一致；计算引擎零改动（报告直接读现有结果全局）。

## 已确认的设计决策（视觉伴侣）

1. **定位**：正式报告——含抬头定制、敏感信息脱敏、页脚免责声明。
2. **多月报告版式**：分节正式式——居中大抬头 + 编号分节（一、计算参数 / 二、计算结果 / 三、备注）+ 页脚声明。
3. **批量多人排布**：逐人工资条块——每人一小节（脱敏身份行 + 逐月小表 + 个人小计），末尾总计行。

## 方案

### 1. 入口与交互

- 三处结果区各加「🖨 打印报告」按钮：多月累计页结果卡（劳务/工资通用）、批量页结果卡标题行（`renderBatchResults`）。结果不存在时按钮不出现。
- 点击后 `prompt` 输入报告抬头（公司/部门名）：默认取上次输入（`localStorage` key `tc-report-header`），留空则只显示报告标题——与政策库 `pmAddCity` 的交互模式一致，不加常驻控件。

### 2. 报告内容

数据源：`window._multiResults`（多月）与 `window._batchResults`（批量），与 CSV 导出同源。

- **抬头**：公司名（可填）+ 报告标题（「工资薪金计算报告」/「劳务报酬计算报告」/「批量计税报告」）+ 计算范围（结果行 min~max 月份）+ 生成时间。
- **一、计算参数**：
  - 多月·工资：参保城市与年度、社保/公积金基数、公积金比例、专项附加（分项开启时列分项合计口径）；
  - 多月·劳务：计税方向、断月重置开关状态、新旧政策口径说明（2025-10 切换）；
  - 批量：所得类型、计税方向、整批参保城市、按应发工资作基数（工资），与兜底链口径一句话。
- **二、计算结果**：
  - 多月：逐月明细表（与结果区同列口径）+ 合计行；
  - 批量：逐人工资条块（脱敏身份行 + 该人逐月小表 + 个人小计）+ 末尾总计行。
- **三、备注 + 页脚**：政策口径一句话（`resolvePolicyMemo` 的年度 label）+ 免责声明「本报告由个税计算器生成，数值仅供参考，以税务机关核定为准」。
- **脱敏规则**（仅批量，多月无身份列）：身份证 `1101**********1234`、电话 `138****8000`、银行卡 `****6789`。

### 3. 实现架构

- 新模块 `js/print-report.js`（`window.PageReport`）：
  - 纯函数（可进 Node 测试）：`buildMultiReportData()` / `buildBatchReportData()`（组装分节数据、逐人分组、小计/总计、脱敏后的展示行）、`maskIdCard/maskPhone/maskBankCard`；
  - DOM 函数：`renderReport(data)` 填充隐藏容器 `#print-report`，`printReport()` 组装后调 `window.print()`。
- 新样式 `css/print.css`：`@media print` 隐藏侧栏/顶栏/输入区/按钮，仅显示 `.print-report`；A4 纵向固定白底黑字（不随亮暗主题）；表头跨页重复（`thead { display: table-header-group; }`）；逐人块 `page-break-inside: avoid`。
- `index.html`：+1 script（`js/print-report.js`，置于 self-tests 前）、+1 css、`<div id="print-report" class="print-report"></div>` 隐藏容器。
- 结果区按钮：`js/page-multi.js` 结果卡与 `js/batch-view.js`（`renderBatchResults` 标题行）各加一个按钮，`onclick="PageReport.printReport('multi'|'batch')"`。

### 4. 测试

- Node（导出器组装套件补 5 条，总量 131 → 136）：脱敏格式三例、批量报告数据组装（两人多月的分组/个人小计/总计与明细一致）、空结果防呆（返回 null 不抛错）。
- `tests/run.js` 加载清单追加 `js/print-report.js`。
- 浏览器冒烟：三处按钮出现时机（计算后）、报告容器填充正确、抬头 prompt 记忆、`print.css` 规则生效、页脚声明存在。

## 边界（不做的）

- 不做程序化 PDF 文件生成（浏览器另存 PDF 即可）；不做报告模板选择/多套版式；不改计算引擎与结果表结构。
- 多月页不脱敏（无身份列）；批量页界面上的显示不脱敏（仅打印报告脱敏）。

## 测试与验收

1. `node tests/run.js` 双 shell 全绿（136 项）。
2. file://（Edge 无头）三套件全绿。
3. 浏览器冒烟（http + IAB）：按钮出现时机、报告 DOM 填充、脱敏格式、抬头记忆。
4. 打印最终效果由用户 Ctrl+P 人工过目（自动化只验 DOM 与 CSS 规则存在）。

## 影响文件

| 文件 | 改动 |
| --- | --- |
| `js/print-report.js` | 新增：报告数据组装 + 脱敏 + 渲染 + 打印触发 |
| `css/print.css` | 新增：打印样式（A4、隐藏界面、跨页规则） |
| `index.html` | +script、+css、+隐藏报告容器 |
| `js/page-multi.js` | 结果卡加打印按钮 |
| `js/batch-view.js` | 结果卡标题行加打印按钮 |
| `tests/run.js` | 加载清单追加 |
| `js/self-tests.js` | 导出器组装套件补报告组装断言（+5） |
| `README.md` | 功能特点与架构描述同步 |

## 实施记录（2026-09-06）

已实施并验收通过：

- 回归门 136/136（导出器组装套件 10→15：脱敏三例、批量组装分组/小计/总计/月份范围、空结果防呆），Git Bash 与 PowerShell 双 shell 全绿；file://（Edge 无头）三套件全绿、零 JS 错误。
- 浏览器冒烟三场景全过：多月·工资（按钮出现、`window.print` 触发、抬头 prompt 记忆、参数分节/合计/政策口径/页脚齐全）、批量·工资（2 人块、总计、整批城市参数、脱敏后身份证原文不出现于报告 DOM）、多月·劳务（断月重置参数、新旧政策口径句、空抬头不出现 undefined）。
- 实施说明：报告数据组装函数接收 `(rows, env)` 两参以保持纯函数可测性（env 由 DOM 层 `collectMultiEnv/collectBatchEnv` 收集）；冒烟中 `window.print/prompt` 以桩替换，真实打印效果待用户 Ctrl+P 人工过目。

## 修复记录（2026-09-07，用户实测反馈）

用户双击打开（file://）点「打印报告」出现**打印预览全空白**，另反馈批量页打印按钮颜色与相邻按钮不统一。两处修复：

1. **根因**：`#print-report` 容器原本插在 `.main-area` 内部，而打印 CSS 以 `body > *:not(#print-report)` 隐藏界面——容器的祖先 `.app-shell` 被隐藏后报告随之消失，打印预览必然全空。修复：容器移至 `<body>` 直接子级；并加双保险 `html, body { height: auto !important; overflow: visible !important; }` 解除视口布局约束，`window.print()` 延迟 60ms 等待布局完成。
2. **按钮风格**：批量页打印按钮 `btn-secondary` → `btn-green`，与相邻导出按钮统一（输出类动作为绿色）。

**验收教训**：此前冒烟只断言了报告 DOM 填充，未覆盖真实打印通道（打印媒体下的呈现），导致结构 bug 漏网；本轮补充断言 `print-report.parentElement === document.body` 与延迟打印时序，最终打印效果仍需用户 Ctrl+P 复验。
