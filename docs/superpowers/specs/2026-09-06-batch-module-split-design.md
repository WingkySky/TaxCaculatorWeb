# page-batch 五拆设计（batch-parse / calc / source / view / export）

日期：2026-09-06
状态：已与用户确认（方案 B 五拆 + 劳务流水线函数化纳入）

## 背景与问题

- `js/page-batch.js` 2,215 行，占全部 JS 的 41%——UI 重设计解耦后剩余的最后一个巨石。
- 内部三种性质混杂：纯逻辑（解析/识别/计税约 1,180 行）、DOM 渲染与事件（约 950 行）、编排（约 90 行）。
- ② 已为批量计税流水线建立 22 项 Node 测试，但劳务逐行计税是 `runBatchCalc` 内联代码，无法 Node 测试（② 规格明确留口）。

## 结构现状 → 归属

| 现区块（行号） | 行数 | DOM | 去向 |
| --- | --- | --- | --- |
| ① 上传/多文件源管理（19–235） | ~215 | 重 | batch-source（状态/读取）+ batch-view（显隐切换） |
| ② 解析纯逻辑（236–714） | ~480 | 无 | batch-parse |
| ③ 智能表识别 + 列映射识别（715–1060） | ~350 | 无 | batch-parse |
| ④ 列映射 UI + 源选择 UI（1077–1323） | ~250 | 重 | batch-view（`buildPersonKey/groupPersons` 归 batch-calc） |
| ⑤ processWithMapping + 预览渲染（1324–1606） | ~280 | 重 | page-batch（编排）+ batch-view（渲染） |
| ⑥ 计税流水线（1607–1958） | ~350 | 几乎无 | batch-calc（`runBatchCalc` 编排留 page-batch） |
| ⑦ renderBatchResults（1960–2162） | ~200 | 重 | batch-view |
| ⑧ CSV/Excel 导出入口（2163–2215） | ~50 | 轻 | batch-export |

## 目标

- 按性质五拆 + 门面：单文件从 2,215 行降到最大约 830 行（batch-parse）。
- `window.PageBatch` 单命名空间**不变**：index.html 内联 `onclick`、self-tests 解构、其他模块引用零感知。
- 劳务流水线函数化 `runBatchLaborPass`，行为零变化，补 Node 断言。
- 现有 126 项断言一行不改。

## 方案

### 1. 模块边界与加载顺序

index.html 在 `page-batch.js` 前插入五个 script，顺序即依赖序：

1. `js/batch-parse.js`（~830 行，零 DOM）：`parseCSV/isGarbled/excelSerialToDate/normalizeMonth/normalizeMonthWithHint/compareMonth/extractMonthHint/extractYearHint/buildMonthFromParts/extractSortDateTime/extractMonthHintFromRows/sanitize*/rowHasUsableIdentity/rowHasStrongIdentity/isSummaryLike*/isAmountLikeNumber/isAmountHeaderExcluded/getAmountColumnScore/getSheetNameScore/scoreDataCoverage/analyzeSheet/analyzeWorkbookSheets/COL_KEYWORDS/COL_TYPE_LABELS/getColumnMatchScore/isHeaderContinuation/mergeHeaderRows/smartDetectTable/detectColumnMapping`
2. `js/batch-calc.js`（~450 行，零 DOM）：`buildPersonKey/groupPersons`、`makeBatchBonusSynthRec/runBatchSalaryPass/makeBatchBonusSeparateRow/runBatchSalaryPerson`、**新增 `runBatchLaborPass(group, records)`**
3. `js/batch-source.js`（~200 行，轻 DOM）：多文件累积状态收口（`_accumRows/_accumSources/_accumFileCount/_pendingFiles/_previewSourceId`）、`handleFile/handleFiles/processFile/readExcel/onFileParsed/buildSourceItem/tagSourceRows/collectSelectedRows/collectPreviewRows/buildBatchSourceLabel/resetBatch/updateAccumIndicator`
4. `js/batch-view.js`（~500 行，重 DOM）：`refreshBatchPreview/showBatchPreview/showColumnMappingUI/renderSourceSelectionHTML/toggleBatchSource/setPreviewSource/selectOnlySource/onMappingChange/confirmColumnMapping/toggleRows/togglePersonTable/togglePreviewTable/renderBatchResults`
5. `js/batch-export.js`（~60 行，轻 DOM）：`exportBatchCSV/exportBatchExcelFormula`
6. `js/page-batch.js` 瘦身为门面（~180 行）：`processWithMapping`（含其内部纯解析闭包，原地保留——它就是编排本体）、`runBatchCalc` 瘦身（取 `window._batchParsed` → incomeType 分派 batch-calc → 交 batch-view 渲染）、`uploadArea` 事件绑定、聚合导出

### 2. 命名空间聚合（外部零感知）

- 五模块各自暴露 `window.BatchParse/BatchCalc/BatchSource/BatchView/BatchExport`（IIFE 风格与现有一致）。
- `page-batch.js` 末尾聚合：`window.PageBatch = Object.assign({}, BatchParse, BatchCalc, BatchSource, BatchView, BatchExport, { 编排函数 })`——导出 **key 集合与 HEAD 一致**（验收脚本比对）。
- 跨模块裸引用改命名空间前缀（如 `showBatchPreview` 模板里的 `_accumFileCount` → `BatchSource` 访问器）；跨模块可变状态统一收口 `BatchSource`。
- `window._batchParsed/_batchFilename/_batchResults/_pendingFiles` 等全局键名不变（测试与编排依赖）。

### 3. 劳务流水线函数化（行为零变化）

`runBatchCalc` 内联劳务段原样提为 `runBatchLaborPass(group, records)`：逐笔返回带 `_isGap/_isOldPolicy` 标注的行，累计/断月重置/新旧政策切换逻辑一行不动，只搬家 + 可测。`runBatchCalc` 只剩分派与渲染。

### 4. 测试

- `tests/run.js` 加载清单在 `page-batch.js` 前追加 5 个新文件；**126 项现有断言不改**（self-tests 仍从 `PageBatch` 门面解构）。
- 批量流水线套件补劳务断言（+6，总量约 132）：正算累计链、断月重置开关与 `_isGap` 标注、新旧政策切换（2025-09→2025-10）行标注且不进累计、旧政策行不扣税、反算劳务端到端。
- 验收脚本比对 `PageBatch` 导出 key 集合与 HEAD 一致（函数搬家、对外面不变）。

## 边界（不做的）

- 不改任何计算行为/文案/样式；家族总行数不减（这是搬运与收口，不是删代码）。
- 不动 batch-view 的 DOM 结构与元素 id；index.html 除 script 追加外零改动。
- 不重命名任何公开函数；不做 view 层的进一步抽象。

## 测试与验收

1. `node tests/run.js`：Git Bash 与 PowerShell 各一次，全绿退出码 0（约 132 项）。
2. file://（Edge 无头加载 `file:///`）：三套件全绿。
3. `PageBatch` 导出 key 集合与 HEAD 一致（一次性脚本比对）。
4. 浏览器冒烟（http + IAB）：批量页函数直调链路（`processWithMapping` → `runBatchCalc` → 结果渲染不报错）+ 上传区/兜底盒/列映射 UI 存在性 + ① 冒烟关键项复跑（侧栏配置组、参数卡、`#/params` 回落）。注：IAB 不支持文件上传，上传交互本身保持既有手工验证口径。
5. README 架构描述同步（模块清单加入 batch-*）。

## 影响文件

| 文件 | 改动 |
| --- | --- |
| `js/batch-parse.js` | 新增（自 page-batch 搬出，纯逻辑） |
| `js/batch-calc.js` | 新增（含 `runBatchLaborPass` 函数化） |
| `js/batch-source.js` | 新增 |
| `js/batch-view.js` | 新增 |
| `js/batch-export.js` | 新增 |
| `js/page-batch.js` | 瘦身为门面编排 + 聚合导出 |
| `index.html` | script 追加 5 行 |
| `tests/run.js` | 加载清单追加 5 文件 |
| `js/self-tests.js` | 批量套件补劳务断言（+6） |
| `README.md` | 架构描述同步 |
