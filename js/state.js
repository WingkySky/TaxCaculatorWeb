/* ============================================================
 * state.js — TaxState 全局会话状态
 * 职责：所得类型、计算方向、批量选项、工资参数等跨页面共享状态。
 * 对外接口：TaxState.{...}；并经 window 属性别名支持模块内裸引用读写。
 * 依赖：无（最先加载）。
 * ============================================================ */

window.TaxState = {
  /* 计算方向：'forward' 税前→税后 | 'reverse' 税后→税前 */
  multiDirection: 'forward',
  batchDirection: 'forward',

  /* 批量「断月重置」开关（仅劳务方向生效） */
  batchGapReset: true,

  /* 所得类型：'labor' 劳务报酬 | 'salary' 工资薪金 */
  incomeType: 'labor',

  /* 批量：整批参保城市（'' = 跟随工资参数）与「按应发工资作基数」 */
  batchCityId: '',
  batchGrossAsBase: false,

  /* 多月累计年终奖方案：'auto' | 'separate' | 'combined' */
  multiBonusStrategy: 'auto',

  /* 专项附加扣除分项默认值（金额为 2023-01 起国家统一标准） */
  extraDetailDefaults: function () {
    return {
      on: false,                                    // 是否启用分项模式（关闭时用单一总额 extraDeduction）
      childEducation: { on: false, count: 1 },      // 子女教育 2000 元/月/孩
      infantCare:     { on: false, count: 1 },      // 3岁以下婴幼儿照护 2000 元/月/孩
      education:      { on: false, kind: 'degree', certMonth: '' }, // 继续教育：学历 400/月 | 职业资格 3600 取得当月
      houseLoan:      { on: false },                // 住房贷款利息 1000 元/月（首套，与房租互斥）
      houseRent:      { on: false, tier: 1500 },    // 住房租金 1500/1100/800 元/月（按城市档）
      support:        { on: false, mode: 'solo', share: 1500 }, // 赡养老人：独生 3000 | 分摊每人 ≤1500
      medical:        { on: false, annual: 0 }      // 大病医疗（年度，仅汇算清缴可用，不参与预扣）
    };
  },

  /* 工资薪金参数（多月累计与批量计算共用） */
  salaryParams: {
    cityId: 'custom',    // 城市 key 或 'custom'
    policyYear: 'auto',  // 'auto' 按月份匹配生效区间 | 固定年度键
    socialBase: 0,       // 社保缴费基数（元/月）；0 = 未设置
    fundBase: '',        // 公积金基数；'' = 跟随社保基数
    fundRate: 0.05,      // 公积金个人比例（城市择档或自定义手填）
    extraDeduction: 0,   // 专项附加扣除单一总额（元/月）——分项模式关闭时生效
    extraDetail: null    // 专项附加扣除分项（下方初始化）
  }
};

TaxState.salaryParams.extraDetail = TaxState.extraDetailDefaults();

/* ---- window 属性别名：各模块内裸引用这些名字时按原全局语义读写 ---- */
(function () {
  var names = ['multiDirection', 'batchDirection', 'batchGapReset', 'incomeType',
    'batchCityId', 'batchGrossAsBase', 'multiBonusStrategy', 'salaryParams', 'extraDetailDefaults'];
  names.forEach(function (k) {
    Object.defineProperty(window, k, {
      configurable: true,
      get: function () { return TaxState[k]; },
      set: function (v) { TaxState[k] = v; }
    });
  });
})();
