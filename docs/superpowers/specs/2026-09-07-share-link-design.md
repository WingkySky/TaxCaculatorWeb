# 结果分享链接设计（多月累计 + 年度汇算）

日期：2026-09-07
状态：已与用户确认（范围：多月+汇算两类；分享内容：计算参数与输入，收件端重算）

## 背景与目标

计算结果目前只能以文件（CSV/Excel/打印报告）形式交付，缺少「发个链接给对方看」的轻量路径。本特性用 **URL hash 携带计算参数**（`#/share?d=<base64url>`），收件人打开即还原输入并自动重算。已知折扣（用户确认接受）：file:// 双击打开时复制的链接只对同机同路径或挂网部署的用户有意义，挂网部署才是分享主场景。

**边界**：批量计算不进分享（多人身份数据敏感 + 数据量大）；分享内容为参数与输入，不含结果快照——结果由收件人本地政策数据重算得出，结果卡自会显示政策口径。

## 方案

### 1. 分享 payload

带版本号的紧凑 JSON，字段用短键（英文/数字），经 base64url（`+/`→`-_`、去 `=`）编码进 hash：

- **多月分享** `t:'multi'`：收入类型、年度、12 个月金额、方向、断月开关（劳务）、工资参数（城市 key、社保基数、公积金基数、公积金比例、专项附加——含分项模式完整状态序列化）、年终奖（金额/发放月/方案，若填）；
- **汇算分享** `t:'annual'`：年度、工资/劳务 12 月、稿酬/特许权总额、三险一金年额、专项附加 7 项、预扣四项手填值（未填则不编码，收件端按估算）。

预估链接长度 200~600 字符，远低于浏览器 URL 上限。

### 2. 入口与生成

- 两处「🔗 分享链接」按钮：多月累计页结果卡按钮行（导出/打印旁，`js/page-multi.js` 结果渲染处）、年度汇算页结果卡标题行（`js/page-annual.js`）；
- 点击 → 组 payload → 生成 URL → `navigator.clipboard.writeText` 复制（file:// 属安全上下文；失败回退 `prompt` 展示手动复制）→ 成功提示含**隐私提醒**（链接包含收入数据，请仅发送给可信对象）。

### 3. 打开与清除

- 路由 `share` 加入 ROUTES；`PageShare.apply()` 解析 `d` 参数：
  - 恢复对应页面的输入（工资参数卡状态、月份网格、汇算表单）→ **自动触发计算**（多月页等价「计算全部」；汇算页等价「开始汇算」——以实际暴露接口为准，必要时经 DOM 触发对应计算按钮）——打开即见结果；
  - **横幅显示在还原目标页顶部**（多月分享 → 多月页；汇算分享 → 汇算页）：「来自分享的数据 · [清除并返回]」——清除 = 清空本次还原的输入、离开分享态回多月页；
  - payload 损坏/版本不符/字段缺失 → 防呆提示并回落多月页，不崩溃、不留半套数据。

### 4. 实现与测试

- 新模块 `js/page-share.js`（`window.PageShare`）：`encodeShare/decodeShare` 纯函数（roundtrip 可测、含损坏输入防呆）、`buildMultiShare/buildAnnualShare`（从页面读状态组 payload）、`buildUrl`、`applyShare`（解析+填充+自动计算+横幅）；
- 横幅 DOM 放 `#page-multi` 顶部区域，样式沿用 `info-box`；
- `index.html` +1 script（page-annual 后、app 前）；`js/app.js` ROUTES + `share`；两处按钮；
- `tests/run.js` 加载清单 +1；`js/self-tests.js` 补 6 条（多月工资/劳务 roundtrip、汇算 roundtrip、损坏 payload 防呆返回 null、12 月金额顺序保持、专项附加分项状态还原）——回归门 154 → ~160；
- 验收：node 双 shell 全绿；file:// 五套件全绿；浏览器冒烟（生成链接 → 打开 → 自动计算结果正确 → 横幅清除 → 损坏链接防呆）。

## 边界（不做的）

- 不做短链服务/二维码生成（纯前端零依赖边界内不做外部服务）；
- 不分享批量数据与打印报告内容；不做结果快照比对（发送时/打开时结果差异由收件人自行对照政策口径）；
- 不改计算引擎。

## 测试与验收

1. `node tests/run.js` 双 shell 全绿（约 160 项）。
2. file://（Edge 无头）五套件全绿。
3. 浏览器冒烟：两类链接生成与打开、自动计算、横幅清除、损坏链接防呆。
4. 隐私提示文案存在。

## 影响文件

| 文件 | 改动 |
| --- | --- |
| `js/page-share.js` | 新增：编解码纯函数 + 生成/应用逻辑 |
| `js/page-multi.js` | 结果卡加分享按钮（调 PageShare） |
| `js/page-annual.js` | 结果卡加分享按钮 |
| `js/app.js` | ROUTES + `share` |
| `index.html` | +1 script |
| `tests/run.js` | 加载清单 +1 |
| `js/self-tests.js` | 分享 roundtrip 断言 +6 |
| `README.md` | 功能特点与架构描述同步 |

## 实施记录（2026-09-07）

已实施并验收通过：

- 回归门 **161/161**（新增分享链接套件 7 条：多月工资/劳务与汇算三类 roundtrip、损坏 payload/版本不符/类型未知防呆、12 月顺序保持），Git Bash 与 PowerShell 双 shell 全绿；file:// 五套件全绿、零 JS 错误。
- 浏览器冒烟全过：多月分享（生成 payload 含参数 → resetMulti 模拟新收件人 → 打开链接自动还原 12 月并计算 12 行结果 → 横幅显示 → 清除后输入清空回多月页）；汇算分享（打开即还原工资/劳务/房贷并自动计算，标准算例 payload 直接复现应补 780）；损坏链接防呆提示并回落多月页。
- 实现说明：自动计算直接调用已导出的 `PageMulti.calcMulti` / `PageAnnual.calc`（无需 DOM 触发）；`share` 路由在 `renderRoute` 特判转发给 `PageShare.applyShare`，由其还原数据后导航到目标页；`currentRoute` 增加对 hash 中 `?query` 的剥离。
- 冒烟方法沿用 no-store 服务器（IAB 缓存教训，见记忆 taxcalc-browser-verification）。

## 修复记录（2026-09-07，用户实测反馈）

用户本地直开分享链接无数据显示。插桩定位（init/render/applyShare 全链日志）：

- **根因**：初始加载时 hash 即 `#/share`，`initRouting` 的首次 `renderRoute` 会在 `PageAnnual.render()`（init 后续步骤）执行**之前**进入 `PageShare.applyShare()`——还原写入的是空页面，`calc()` 撞上未渲染的 `ann-year` 抛 TypeError，**init 整个中断**（页面半初始化、自检不跑）。
- **修复**：`app.js` 加 `booted` 标志——启动期的 share 路由先跳过（`renderRoute` 直接 return），init 完成后统一检测 `currentRoute()==='share'` 再执行 `applyShare`；运行期跳转分享链接仍即时处理。
- **验证**：headless 冷启动直开 `file:///…#/share?d=…`——页面完整渲染、自动计算、横幅显示、应补 780、零 JS 错误、自检正常；普通加载对照无回归；`node tests/run.js` 161/161。IAB 复验时收件端按本地参数（北京默认）算出应补 420——与横幅「结果按收件人本地政策数据得出」的分享语义一致，属正确行为。
