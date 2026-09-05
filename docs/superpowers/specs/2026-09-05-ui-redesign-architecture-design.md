# UI 重设计与架构解耦 · 设计规格（Ant 企业蓝 / 侧边栏控制台 / 亮暗双主题 / 纯静态多文件）

日期：2026-09-05
状态：设计已获用户认可，待实施

## 背景与问题

`tax-calculator.html` 已增长为 6197 行、273KB 的单文件（CSS 约 790 行、JS 约 5200 行、227 处 inline style、113 处 emoji 图标）。功能逐个临时添加导致：

1. **布局失衡**：两个占半屏的 info-box 顶在计算页上方；政策库挤在弹层里；参数卡悬在页签之上，归属含糊
2. **风格漂移**：每批功能带来一批 inline style 与一次性配色，无统一组件语言
3. **"AI 味"**：紫色渐变标题、emoji 当图标、千篇一律的暗色卡片观感

## 用户决策记录（brainstorming 会话结论）

| 决策点 | 结论 |
|---|---|
| 分发方式 | 终端用户零环境零配置：产物必须 file:// 双击可用；开发需兼容将来挂网（任意静态服务器） |
| 目标用户 | 双人群兼顾：主界面亲民清晰，专业功能（批量/政策库/公式导出）收进配置区 |
| 视觉语言 | **Ant Design 企业蓝（浅色）**——只借设计语言手写实现，不引入 antd 运行时库 |
| 布局骨架 | **B · 侧边栏控制台**，可折叠；宽表格用折叠栏 + 表内横向滚动缓解 |
| 主题 | **亮暗双主题**，CSS 变量两套 token，默认跟随系统，手动切换存 localStorage |
| 架构 | **纯静态多文件**：classic script + IIFE 命名空间，零构建零依赖 |

## 一、信息架构

侧边栏三组菜单，每个功能有唯一归属：

| 分组 | 菜单项 | 路由 | 内容 |
|---|---|---|---|
| 计算 | 多月累计 | `#/multi` | 12 月网格、方向切换、断月开关、年终奖输入、结果区 |
| | 批量计算 | `#/batch` | 上传 → 列映射 → 预览 → 结果；页内放导出按钮组 |
| 配置 | 工资参数 | `#/params` | 现参数卡独立成页：城市/年度/基数/公积金比例/专项附加分项/预览月份 |
| | 政策库 | `#/policy` | 现弹层独立成页：城市/年度增删、编辑器、Excel/JSON 导入导出 |
| 帮助 | 计算规则 | `#/rules` | README 计税规则内容成页（税率表/公式/示例/新旧政策说明） |

- **顶栏**（全局固定）：侧栏折叠按钮、所得类型切换（劳务/工资，全局状态，两计算页共用，联动逻辑不变）、主题切换按钮
- 劳务模式下「工资参数」菜单保持可见，页面顶部显示"当前为劳务报酬模式，以下参数仅对工资薪金生效"横幅（不隐藏、不禁用）
- 计算页顶部不再放大段 info-box，必要的操作提示就近折叠（`<details>` 或 Alert 组件）
- 移动端（≤768px）：侧栏转为顶部汉堡按钮唤起的抽屉 + 遮罩

## 二、设计系统（手写 Ant Design 语言）

**原则：只借设计语言，不引入任何库；生产环境不加载任何 webfont（离线 file:// 可用），中文字体用系统栈。**

### 设计 token（css/tokens.css，两套值）

| Token | 亮色 | 暗色（antd v5 深色规范） |
|---|---|---|
| `--t-primary` | `#1677ff` | `#1668dc` |
| `--t-primary-hover` | `#4096ff` | `#3c89e8` |
| `--t-primary-bg` | `#e6f4ff` | `rgba(22,104,220,.15)` |
| `--t-bg-layout` | `#f5f7fa` | `#0f0f0f` |
| `--t-bg-container` | `#ffffff` | `#1f1f1f` |
| `--t-bg-elevated` | `#ffffff` | `#262626` |
| `--t-border` | `#d9d9d9` | `#303030` |
| `--t-split` | `#f0f0f0` | `#333333` |
| `--t-text` | `rgba(0,0,0,.88)` | `rgba(255,255,255,.85)` |
| `--t-text-2` | `rgba(0,0,0,.65)` | `rgba(255,255,255,.65)` |
| `--t-text-3` | `rgba(0,0,0,.45)` | `rgba(255,255,255,.45)` |
| `--t-success` | `#52c41a` | `#49aa19` |
| `--t-warning` | `#faad14` | `#d89614` |
| `--t-error` | `#ff4d4f` | `#dc4446` |

- 圆角三档：`--t-radius: 8px`（容器/卡片）、`6px`（控件）、`4px`（小元素）
- 8px 间距栅格；数字一律 `font-variant-numeric: tabular-nums`
- 字体栈：`-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`
- 主题切换机制：`<html class="theme-dark">` 一个 class 切换整套变量；默认跟随 `prefers-color-scheme`，手动选择持久化 `localStorage('tc-theme')`

### 组件清单（css/components.css，禁止页面私有样式）

Button（primary/default/text/danger，含 small）、Input/Select/Checkbox/Switch、Segmented（所得类型/方向切换）、Card（head/body）、Table（含粘性首列宽表变体、悬停、合计行）、Tag（含语义色）、Alert/InfoBox、Modal、Drawer（移动端侧栏复用）、Statistic（汇总数字卡）、Empty、Toast（操作反馈）、Tooltip、Upload 区。

### 图标

内联 SVG（Lucide 线条风格、24×24 viewBox、stroke 2px），由 `UI.icon(name)` 统一输出；**禁止 emoji 作为 UI 图标**。首批：calendar、upload、settings、database、file-text、sun、moon、menu、x、download、trash、plus、check、alert-triangle、info、chevron-down、table、calculator、user、log-out（导出）。

## 三、文件架构（纯静态多文件）

```
D:\TaxCaculatorWeb\
├── index.html            # 入口壳：侧栏/顶栏/页面容器骨架 + 按序引入
├── css/
│   ├── tokens.css        # 亮暗两套变量 + 主题 class 切换
│   ├── base.css          # reset、字体、滚动条、a11y（focus ring）、工具类
│   ├── components.css    # 组件清单全部实现
│   └── layout.css        # 侧栏（208px ↔ 56px 折叠）/顶栏/页面容器/≤768px 抽屉
├── js/
│   ├── state.js          # TaxState：incomeType、salaryParams、multi/batch 会话状态
│   ├── utils.js          # TaxUtils：parseAmount/formatNum/round2/escAttr/parseYearMonth…
│   ├── tax-engine.js     # TaxEngine：税率表/正反算/年终奖/旧政策/方案对比（纯函数）
│   ├── policy-library.js # PolicyLib：种子合并/localStorage 持久化/resolvePolicy/导入导出行转换
│   ├── social-insurance.js # SocialIns：三险一金明细/专项附加/企业用工成本
│   ├── exporter.js       # Exporter：CSV/Excel 公式导出/模板下载/ensureXLSX
│   ├── ui.js             # UI：icon/modal/toast/table 渲染等通用件
│   ├── page-multi.js     # PageMulti
│   ├── page-batch.js     # PageBatch：解析/智能识别/列映射/批量流水线/结果渲染
│   ├── page-params.js    # PageParams
│   ├── page-policy.js    # PagePolicy
│   ├── app.js            # App：hash 路由、侧栏、主题、income-type 联动、初始化
│   └── self-tests.js     # TaxTest：94 项自检，页面加载自动运行
├── tax-policy-data.js    # 出厂种子【文件名与结构不变】，跨机拷贝习惯照旧
├── README.md             # 同步更新（新结构、双主题、挂网说明）
└── docs/
```

### 模块契约

引入顺序 = 依赖顺序：`tax-policy-data.js → state → utils → tax-engine → policy-library → social-insurance → exporter → ui → page-multi → page-batch → page-params → page-policy → app → self-tests`

| 文件 | 全局 | 对外接口（现函数迁移去向） | 依赖 |
|---|---|---|---|
| state.js | `TaxState` | incomeType / salaryParams / multiBonusStrategy / batch 累加状态 | — |
| utils.js | `TaxUtils` | parseAmount, parseFundRate, round2, formatNum, formatRate, escAttr, parseYearMonth, compareMonth 等纯工具 | — |
| tax-engine.js | `TaxEngine` | BRACKETS, getBracket, calcTaxForward/Reverse, calcTaxOldPolicy, isNewPolicy, calcBonusTaxSeparate, findBonusTrapZone, compareBonusStrategies, calcSalaryCumulativeTax, mergeBonusIntoEntries | TaxUtils |
| policy-library.js | `PolicyLib` | loadPolicyLibrary/savePolicyLibrary, normalizePolicyLibrary, resolvePolicy(Memo), clampItemBase, libraryToRows/rowsToLibrary | TaxUtils, 种子 |
| social-insurance.js | `SocialIns` | computeSocialInsuranceDetail/For, computeExtraDetailFor, getExtraDeductionFor, extraDetailDefaults, suggestHouseRentTier | PolicyLib |
| exporter.js | `Exporter` | exportMultiCSV, exportBatchCSV, exportMultiExcelFormula, exportBatchExcelFormula, buildSalaryFormulaGrid, gridToWorksheet, downloadTemplate, ensureXLSX | TaxEngine, PolicyLib, SocialIns, TaxUtils |
| ui.js | `UI` | icon(name), openModal/closeModal, toast(msg,type), 表格构建 helper, monthGrid builder | TaxUtils |
| page-multi.js | `PageMulti` | init, calcMulti, resetMulti, buildMonthGrid, renderMultiResults, exportMulti* | TaxEngine, PolicyLib, SocialIns, UI, Exporter, TaxState |
| page-batch.js | `PageBatch` | handleFile(s), parseCSV, readExcel, analyzeSheet/Workbook, smartDetectTable, detectColumnMapping, processWithMapping/processBatch, runBatch*, renderBatchResults, exportBatch* | 同上 + TaxState |
| page-params.js | `PageParams` | init, readSalaryParams, renderSalaryItemsTable, renderExtraDetailPanel, onCityParamChange | PolicyLib, SocialIns, UI, TaxState |
| page-policy.js | `PagePolicy` | init, renderPolicyEditor, pmAddCity/AddYear/DeleteYear/ResetToSeed, pmImport/Export* | PolicyLib, UI, Exporter |
| app.js | `App` | init（路由注册/侧栏/主题/所得类型联动）, navigate(route) | 全部 |
| self-tests.js | `TaxTest` | runSelfTests（console），加载即运行 | TaxEngine, PolicyLib, SocialIns, TaxUtils |

**边界约定**：每个文件文件头注释声明「职责 / 对外接口 / 依赖」；页面文件只经命名空间调用其他模块，不直接触他页 DOM；`onclick="…"` 内联处理器统一改为命名空间调用（如 `onclick="PageMulti.calc()"`），迁移时保持函数行为不变。

## 四、迁移策略

1. **计算逻辑零改动**：tax-engine / policy-library / social-insurance / exporter 的迁移方式是"剪切进命名空间"，不改算法与数据结构；94 项自检作为安全网，迁移后必须原样全过
2. **DOM id 全部保留**：静态骨架与 JS 模板里的 id 一律不改名，`getElementById` 不断链
3. **实施顺序**：① 建目录与 tokens/base/components/layout，写设计系统 → ② 重写 index.html 骨架（侧栏/顶栏/五个空页面容器）→ ③ 逐模块剪切 JS 并挂命名空间（每拆一个模块跑一次自检）→ ④ 各页面重排为 antd 结构、227 处 inline style 清理为 class → ⑤ 图标替换 emoji → ⑥ 删旧 `tax-calculator.html`、更新 README
4. **旧文件处置**：验收通过前旧 `tax-calculator.html` 保留在工作区不动；验收通过后从根目录删除（git 历史可找回），避免双入口漂移
5. **挂网验证**：任意静态服务器（如 `python -m http.server`）下全功能回归一次；file:// 下重点验证 SheetJS CDN 按需加载与 localStorage 持久化

## 五、验收标准

- [ ] 94 项自检全部通过（console 无 fail）
- [ ] file:// 双击打开全功能可用，console 无阻断错误
- [ ] 静态服务器挂载可用（挂网形态验证）
- [ ] 亮 / 暗两主题逐组件检查：对比度 4.5:1、边框可见、粘性列底色正确
- [ ] 375px / 768px / 1440px 三档宽度：无页面级横向滚动（表格内部滚动）、侧栏抽屉正常
- [ ] README 功能清单逐项对照无缺失；批量/政策库/导出三大功能手工冒烟
- [ ] 渲染页面交视觉验收（judge）通过

## 六、非目标（YAGNI）

- 不引入前端框架、构建工具、npm 依赖树
- 不引入 webfont / 图标库运行时
- 不做国际化、不做后端、不做图表可视化
- 不改任何计税规则与数据结构（含 tax-policy-data.js 格式）
- 暗色主题不做"每页微调"，仅靠两套 token + 少量组件级覆盖变量

## 风险与对策

| 风险 | 对策 |
|---|---|
| 5200 行 JS 剪切时漏函数/断引用 | 按模块逐个拆，每拆一个跑自检 + console 扫错；拆完全局搜索旧函数名确认无游离引用 |
| 227 处 inline style 一次性清理引入回归 | 只替换视觉类 inline style；布局关键行内样式（如 display:none 显隐切换）改为 class 切换时逐个核对 |
| file:// 下 localStorage/CDN 行为差异 | 保留现有 try/catch 容错与 ensureXLSX 按需加载模式，验收清单单列 file:// 项 |
| 双主题对比度不达标 | token 定稿后跑一次对比度抽检（正文/次要文字/边框），不达标先调 token 再实施组件 |
