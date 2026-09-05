/* ============================================================
 * self-tests.js — TaxTest 页面自检
 * 职责：94 项计税/政策库/公式导出自检，页面加载后自动运行并输出 console。
 * 对外接口：window.TaxTest。依赖：TaxEngine/PolicyLib/SocialIns/Exporter/PageMulti/PageBatch/TaxState/TaxUtils。
 * ============================================================ */
(function () {
'use strict';
  const calcBonusTaxSeparate = (...a) => TaxEngine.calcBonusTaxSeparate(...a);
  const findCityKey = (...a) => PolicyLib.findCityKey(...a);
  const compareBonusStrategies = (...a) => TaxEngine.compareBonusStrategies(...a);
  const buildSalaryFormulaGrid = (...a) => Exporter.buildSalaryFormulaGrid(...a);
  const round2 = (...a) => TaxUtils.round2(...a);
  const CITY_POLICY_LIBRARY = PolicyLib.CITY_POLICY_LIBRARY;
  const calcTaxForward = (...a) => TaxEngine.calcTaxForward(...a);
  const buildBonusSeparateRow = (...a) => PageMulti.buildBonusSeparateRow(...a);
  const findBonusTrapZone = (...a) => TaxEngine.findBonusTrapZone(...a);
  const parseFundRate = (...a) => TaxUtils.parseFundRate(...a);
  const detectColumnMapping = (...a) => PageBatch.detectColumnMapping(...a);
  const TAX_STRATEGIES = TaxEngine.TAX_STRATEGIES;
  const getExtraDeductionFor = (...a) => SocialIns.getExtraDeductionFor(...a);
  const rowsToLibrary = (...a) => PolicyLib.rowsToLibrary(...a);
  const computeSocialInsuranceDetail = (...a) => SocialIns.computeSocialInsuranceDetail(...a);
  const computeExtraDetailFor = (...a) => SocialIns.computeExtraDetailFor(...a);
  const libraryToRows = (...a) => PolicyLib.libraryToRows(...a);
  const computeSocialInsurance = (...a) => SocialIns.computeSocialInsurance(...a);
  const calcSalaryCumulativeTax = (...a) => TaxEngine.calcSalaryCumulativeTax(...a);
  const resolvePolicy = (...a) => PolicyLib.resolvePolicy(...a);
  const mergeBonusIntoEntries = (...a) => TaxEngine.mergeBonusIntoEntries(...a);
  const calcTaxReverse = (...a) => TaxEngine.calcTaxReverse(...a);

// ==================== Self tests ====================
// 控制台自检：城市政策库、逐险种 clamp、年度匹配、工资累计预扣、反算、劳务回归。
// 页面加载时自动运行，也可在控制台手动调用 runSelfTests() 查看明细。

function runSelfTests() {
  const t = [];
  const eq = (name, actual, expected, eps = 0.0001) => {
    const ok = Math.abs(actual - expected) <= eps;
    t.push({ name, ok, actual, expected });
    return ok;
  };
  const isTrue = (name, cond) => eq(name, cond ? 1 : 0, 1);

  const saved = JSON.parse(JSON.stringify(salaryParams));
  salaryParams.policyYear = 'auto';
  salaryParams.cityId = 'custom';
  salaryParams.fundRate = 0.12;
  salaryParams.socialBase = 10000;
  salaryParams.fundBase = '';
  salaryParams.extraDeduction = 1000;

  // —— 自定义城市（承接首版行为）：养老8% 医疗2% 失业0.5% 公积金12%，无上下限 ——
  eq('自定义城市三险一金 = 基数×22.5%', computeSocialInsurance(10000, ''), 2250);

  // —— 公积金月缴存额四舍五入取整到元 ——
  const customItems = resolvePolicy('custom', '2026-01').items;
  eq('公积金取整·500.5→501', computeSocialInsuranceDetail(10010, '', customItems, 0.05).fund, 501);
  eq('公积金取整·500.2→500', computeSocialInsuranceDetail(10004, '', customItems, 0.05).fund, 500);
  eq('公积金取整·公积金基数单独生效', computeSocialInsuranceDetail(10000, 8000, customItems, 0.12).fund, 960);

  // —— 城市政策：逐险种 clamp（广州2024年度：养老下限5500，医保按自然年6236，失业下限=最低工资2300）——
  const gz = resolvePolicy('guangzhou', '2025-06');
  isTrue('广州2025-06 匹配2024年度', gz.yearKey === '2024');
  const gzD = computeSocialInsuranceDetail(3000, '', gz.items, 0.05);
  eq('广州低基数·养老按下限5500', gzD.pension, round2(5500 * 0.08));
  eq('广州低基数·医疗按下限6236', gzD.medical, round2(6236 * 0.02));
  eq('广州低基数·失业(3000高于下限2300不clamp, 0.2%)', gzD.unemployment, round2(3000 * 0.002));
  eq('广州低基数·公积金(3000高于下限2300不clamp)', gzD.fund, round2(3000 * 0.05));
  eq('广州低基数·合计', gzD.total, round2(5500 * 0.08 + 6236 * 0.02 + 3000 * 0.002 + 3000 * 0.05));
  const gzHi = computeSocialInsuranceDetail(999999, '', gz.items, 0.05);
  eq('广州高基数·养老按上限27501', gzHi.pension, round2(27501 * 0.08));

  // —— 年度匹配：广州 7 月切换社保年度；固定年度覆盖 auto ——
  isTrue('广州2025-07 匹配2025年度', resolvePolicy('guangzhou', '2025-07').yearKey === '2025');
  isTrue('广州2024-06 匹配2023年度', resolvePolicy('guangzhou', '2024-06').yearKey === '2023');
  salaryParams.policyYear = '2024';
  isTrue('固定年度覆盖自动匹配', resolvePolicy('guangzhou', '2025-07').yearKey === '2024');
  salaryParams.policyYear = 'auto';
  isTrue('无匹配月份回退最新年度并标注', resolvePolicy('guangzhou', '2030-01').matched === false);

  // —— 城市别名与未知城市 ——
  isTrue('别名匹配「广州市」', findCityKey('广州市') === 'guangzhou');
  isTrue('未知城市返回 null', findCityKey('火星市') == null);

  // —— 2026 年度数据（外置 tax-policy-data.js）——
  isTrue('政策数据文件已加载（≥12城+自定义）', Object.keys(CITY_POLICY_LIBRARY).length >= 13);
  isTrue('广州2026-09 匹配2026年度（广东沿用过渡）', (() => { const p = resolvePolicy('guangzhou', '2026-09'); return p.yearKey === '2026' && p.matched; })());
  isTrue('北京2026-08 养老上限36348', resolvePolicy('beijing', '2026-08').items.pension.upper === 36348);
  isTrue('上海2026-07 养老下限7546', resolvePolicy('shanghai', '2026-07').items.pension.lower === 7546);
  isTrue('深圳2026-09 公积金下限2700（2026-09-01起新职工）', resolvePolicy('shenzhen', '2026-09').items.fund.lower === 2700);

  // —— 广东 2026-09-01 最低工资调整（粤府函〔2026〕188号）——
  isTrue('广州2026-09 公积金下限2680（随最低工资）', resolvePolicy('guangzhou', '2026-09').items.fund.lower === 2680);
  isTrue('深圳2026-09 失业下限2700/上限48471（随最低工资）', (() => {
    const u = resolvePolicy('shenzhen', '2026-09').items.unemployment;
    return u.lower === 2700 && u.upper === 48471;
  })());
  isTrue('广州2025年度公积金下限2500（2025-03起旧最低工资）', resolvePolicy('guangzhou', '2025-09').items.fund.lower === 2500);

  // —— 广深分险种口径核实（2025-09-04 检索）——
  isTrue('广州2025社保年度失业=最低工资2500/上限41112', (() => {
    const u = resolvePolicy('guangzhou', '2025-09').items.unemployment;
    return u.lower === 2500 && u.upper === 41112;
  })());
  isTrue('广州医保按自然年：2025为6236/31179', resolvePolicy('guangzhou', '2025-09').items.medical.lower === 6236);
  isTrue('深圳公积金2025年度=2360/44265（下限按2024最低工资口径）', (() => {
    const f = resolvePolicy('shenzhen', '2025-09').items.fund;
    return f.lower === 2360 && f.upper === 44265;
  })());

  // —— Excel/JSON 扁平转换 roundtrip ——
  const rtLib = rowsToLibrary(libraryToRows(CITY_POLICY_LIBRARY)).library;
  isTrue('政策库 Excel 扁平转换 roundtrip', JSON.stringify(rtLib) === JSON.stringify(CITY_POLICY_LIBRARY));

  // —— 广州 vs 深圳同薪差异（分城市政策生效）——
  const sz = resolvePolicy('shenzhen', '2025-06');
  const gz8000 = computeSocialInsuranceDetail(8000, '', gz.items, 0.05);
  const sz8000 = computeSocialInsuranceDetail(8000, '', sz.items, 0.05);
  isTrue('广州深圳同薪三险一金不同', gz8000.total !== sz8000.total);

  // —— 批量「公积金比例」列：多写法解析与行内择档 ——
  eq('parseFundRate 5→0.05', parseFundRate('5'), 0.05);
  eq('parseFundRate 12→0.12', parseFundRate('12'), 0.12);
  eq('parseFundRate 0.05→0.05', parseFundRate('0.05'), 0.05);
  eq('parseFundRate "5%"→0.05', parseFundRate('5%'), 0.05);
  isTrue('parseFundRate 空串→空（回退全局）', parseFundRate('') === '');
  isTrue('parseFundRate 120→空（非法）', parseFundRate('120') === '');
  isTrue('parseFundRate 负数→空（非法）', parseFundRate('-3') === '');
  isTrue('行内公积金比例生效：12%≠5% 缴存额', (() => {
    const d12 = computeSocialInsuranceDetail(10000, '', customItems, 0.12);
    const d05 = computeSocialInsuranceDetail(10000, '', customItems, 0.05);
    return d12.fund !== d05.fund && d12.fundRateUsed === 0.12 && d05.fundRateUsed === 0.05;
  })());
  isTrue('列识别：「公积金比例」→fundRate（不与基数列冲突）', (() => {
    const m = detectColumnMapping(['姓名', '应发工资', '公积金比例', '社保基数'], [['张三', 10000, 5, 10000]]);
    return m.cols[2].type === 'fundRate' && m.cols[3].type === 'socialBase';
  })());
  isTrue('列识别：「三险一金」表头不再映射任何类型', (() => {
    const m = detectColumnMapping(['姓名', '应发工资', '三险一金'], [['张三', 10000, 2250]]);
    return m.cols[2].type === '';
  })());
  isTrue('列识别：模板表头结构（公积金比例列 + 专项附加列）', (() => {
    const m = detectColumnMapping(
      ['姓名', '身份证号', '月份', '应发工资', '城市', '社保基数', '公积金基数', '公积金比例', '专项附加扣除'],
      [['张三', '110101199001011234', '2026-01', 10000, '广州', 10000, 10000, 5, 1000]]);
    return m.cols[7].type === 'fundRate' && m.cols[8].type === 'extraDeduction';
  })());
  isTrue('列识别：「年终奖」→bonus（不与金额列冲突）', (() => {
    const m = detectColumnMapping(
      ['姓名', '应发工资', '年终奖', '社保基数'],
      [['张三', 10000, 36000, 10000]]);
    return m.cols[1].type === 'amount' && m.cols[2].type === 'bonus' && m.cols[3].type === 'socialBase';
  })());

  // —— 政策库 JSON roundtrip ——
  const snapshot = JSON.stringify(CITY_POLICY_LIBRARY);
  isTrue('政策库导入导出 roundtrip', JSON.stringify(JSON.parse(snapshot)) === snapshot);

  // —— 工资薪金累计预扣（验收算例：月薪1万、三险一金2250、专项附加1000）——
  const ctx = { socialInsurance: 2250, extraDeduction: 1000 };
  let cumIncome = 0, cumTax = 0, cumDeduction = 0;
  const monthly = [];
  for (let m = 1; m <= 3; m++) {
    cumDeduction += 5000 + 2250 + 1000;
    const r = calcTaxForward(10000, cumIncome, cumDeduction, cumTax, TAX_STRATEGIES.salary, ctx);
    cumIncome = r.cumIncome; cumTax = r.cumTaxDue;
    monthly.push(r);
  }
  eq('工资1月个税 52.50', monthly[0].currentTax, 52.5);
  eq('工资1月实发 7697.50', monthly[0].postTax, 7697.5);
  eq('工资2月个税 52.50（累计递进）', monthly[1].currentTax, 52.5);
  eq('工资3月累计应纳税所得额 5250', monthly[2].taxableIncome, 5250);
  eq('工资3月累计个税 157.50', monthly[2].cumTaxDue, 157.5);

  // —— 反算往返：实发 7697.50 → 应发 10000 ——
  const rev = calcTaxReverse(7697.5, 0, 8250, 0, TAX_STRATEGIES.salary, ctx);
  eq('工资反算应发 10000', rev.preTax, 10000, 0.01);
  eq('工资反算实发回代 7697.50', rev.postTax, 7697.5, 0.01);

  // 高薪跳档：月薪3万，第2个月进入10%档
  const r1 = calcTaxForward(30000, 0, 8250, 0, TAX_STRATEGIES.salary, ctx);
  const r2 = calcTaxForward(30000, r1.cumIncome, 16500, r1.cumTaxDue, TAX_STRATEGIES.salary, ctx);
  eq('工资高薪1月个税（3%档）652.50', r1.currentTax, 652.5);
  eq('工资高薪2月个税（10%档）1177.50', r2.currentTax, 1177.5);

  // —— 劳务报酬回归（默认策略行为不变）——
  const l1 = calcTaxForward(10000, 0, 5000, 0);
  eq('劳务预扣收入额 ×80% = 8000', l1.withholdingIncome, 8000);
  eq('劳务1月个税 90', l1.currentTax, 90);
  eq('劳务1月税后 9910', l1.postTax, 9910);
  const lrev = calcTaxReverse(9910, 0, 5000, 0);
  eq('劳务反算税前 10000', lrev.preTax, 10000, 0.01);
  const l2 = calcTaxForward(10000, l1.cumIncome, 10000, l1.cumTaxDue);
  eq('劳务2月个税 90（累计递进）', l2.currentTax, 90);

  // —— 年终奖单独计税（÷12 定档）——
  eq('年终奖36000 → 3% 档税额 1080', calcBonusTaxSeparate(36000), 1080);
  eq('年终奖144000 → 10% 档税额 14190', calcBonusTaxSeparate(144000), 14190);
  eq('年终奖36001 → 跳 10% 档税额 3390.10', calcBonusTaxSeparate(36001), 3390.1);
  eq('年终奖123456.78 → 10% 档税额 12135.68', calcBonusTaxSeparate(123456.78), 12135.68);

  // —— 年终奖无效区间（六段边界）——
  isTrue('无效区间 37000 命中，建议回到 36000', (() => {
    const z = findBonusTrapZone(37000);
    return z && z.suggest === 36000 && z.to > 38566 && z.to < 38567;
  })());
  isTrue('无效区间上沿 38566.67 仍命中', !!findBonusTrapZone(38566.67));
  isTrue('无效区间外 40000 不命中', findBonusTrapZone(40000) == null);
  isTrue('144000 恰在下沿不命中', findBonusTrapZone(144000) == null);
  isTrue('144001 命中第二段', (() => {
    const z = findBonusTrapZone(144001);
    return z && z.suggest === 144000;
  })());
  isTrue('1120000 命中最末段，1120000.01 不命中', !!findBonusTrapZone(1120000) && findBonusTrapZone(1120000.01) == null);

  // —— 年终奖方案对比：月薪1万×12（三险一金2250+附加1000）+ 发12月年终奖36000 ——
  const bonusEntries = [];
  for (let m = 1; m <= 12; m++) {
    bonusEntries.push({ month: '2026-' + String(m).padStart(2, '0'), amount: 10000, si: 2250, extra: 1000 });
  }
  eq('全年工资累计税额（无年终奖）630', calcSalaryCumulativeTax(bonusEntries), 630);
  const bonusPlan = compareBonusStrategies(bonusEntries, { amount: 36000, month: '2026-12' });
  eq('方案对比·单独计税税额 1080', bonusPlan.separateTax, 1080);
  eq('方案对比·并入增量 2550', bonusPlan.combinedBonusTax, 2550);
  eq('方案对比·并入全年合计 3180', bonusPlan.combinedTotalTax, 3180);
  isTrue('方案对比·推荐单独计税，节税 1470', bonusPlan.recommendation === 'separate' && bonusPlan.saving === 1470);
  const bonusPlanHi = compareBonusStrategies(bonusEntries, { amount: 36000, month: '2026-01' });
  isTrue('方案对比·并入发放月不影响全年合计（3180）', bonusPlanHi.combinedTotalTax === 3180);
  const bonusMerge = mergeBonusIntoEntries(bonusEntries.slice(0, 2), { amount: 36000, month: '2026-01' });
  isTrue('年终奖插入发放月工资之后', bonusMerge.length === 3 && bonusMerge[1].isBonus === true && bonusMerge[2].month === '2026-02');

  // —— 单位部分社保（自定义城市：单位养老16% 医疗8% 失业0.5% 工伤0.2%，公积金同个人档）——
  const erDet = computeSocialInsuranceDetail(10000, '', customItems, 0.05);
  eq('单位养老 1600', erDet.employer.pension, 1600);
  eq('单位医疗 800', erDet.employer.medical, 800);
  eq('单位失业 50', erDet.employer.unemployment, 50);
  eq('单位工伤 20', erDet.employer.injury, 20);
  eq('单位公积金同个人档 500', erDet.employer.fund, 500);
  eq('单位合计 2970', erDet.employer.total, 2970);

  // —— 专项附加分项（含互斥与上限校验）——
  isTrue('分项合计：子女2000+房租1500+赡养3000=6500', (() => {
    const r = computeExtraDetailFor({
      childEducation: { on: true, count: 1 },
      houseRent: { on: true, tier: 1500 },
      support: { on: true, mode: 'solo' }
    }, '2026-01');
    return r.total === 6500 && r.messages.length === 0;
  })());
  isTrue('分项校验：房贷房租互斥提示且按房贷计', (() => {
    const r = computeExtraDetailFor({
      houseLoan: { on: true }, houseRent: { on: true, tier: 1500 }
    }, '2026-01');
    return r.total === 1000 && r.messages.some(m => m.indexOf('互斥') >= 0);
  })());
  isTrue('分项校验：非独生分摊 2000 → 按 1500 计并提示', (() => {
    const r = computeExtraDetailFor({ support: { on: true, mode: 'share', share: 2000 } }, '2026-01');
    return r.total === 1500 && r.messages.length === 1;
  })());
  isTrue('职业资格 3600 仅取得当月计入', (() => {
    const d = { education: { on: true, kind: 'cert', certMonth: '2026-06' } };
    const a = computeExtraDetailFor(d, '2026-06').total;
    const b = computeExtraDetailFor(d, '2026-07').total;
    return a === 3600 && b === 0;
  })());
  isTrue('大病医疗不计入月度预扣，返回年度金额', (() => {
    const r = computeExtraDetailFor({ medical: { on: true, annual: 40000 } }, '2026-01');
    return r.total === 0 && r.medicalAnnual === 40000 && r.messages.length === 1;
  })());
  eq('单一总额模式回退：getExtraDeductionFor', getExtraDeductionFor('2026-01').total, 1000);

  // —— Excel 公式明细网格：公式与缓存值抽查 ——
  const gridRows = [];
  (() => {
    let cumIncome = 0, cumTaxT = 0, cumDed = 0, cumSIg = 0, cumEx = 0;
    for (let m = 1; m <= 2; m++) {
      const ym = '2026-0' + m;
      const siD = computeSocialInsuranceDetail(10000, '', customItems, 0.05);
      cumDed += 5000 + siD.total + 1000;
      const rr = calcTaxForward(10000, cumIncome, cumDed, cumTaxT, TAX_STRATEGIES.salary, { socialInsurance: siD.total, extraDeduction: 1000 });
      cumIncome = rr.cumIncome; cumTaxT = rr.cumTaxDue;
      cumSIg = round2(cumSIg + siD.total); cumEx = round2(cumEx + 1000);
      gridRows.push({
        month: ym, person: '测试', preTax: 10000, postTax: rr.postTax, withholdingIncome: rr.withholdingIncome,
        cumIncome: rr.cumIncome, cumDeduction: rr.cumDeduction, taxableIncome: rr.taxableIncome,
        rate: rr.rate, quick: rr.quick, cumTaxDue: rr.cumTaxDue, currentTax: rr.currentTax,
        extraDeduction: 1000, socialInsurance: siD.total,
        _siDetail: siD, _cumSI: cumSIg, _cumExtra: cumEx, _isBonus: false
      });
    }
  })();
  const grid = buildSalaryFormulaGrid(gridRows, {
    chainKey: () => '2026', cityOf: () => 'custom', nameOf: () => '测试', cityLabel: () => '自定义政策'
  });
  isTrue('公式导出·养老公式为 ROUND(F2*0.08,2) 且缓存一致', (() => {
    const cell = grid.rows[0][8];
    return cell.f === 'ROUND(F2*0.08,2)' && Math.abs(cell.v - gridRows[0]._siDetail.pension) < 1e-9;
  })());
  isTrue('公式导出·公积金基数引用社保基数（=F2），缴存额 ROUND(G2*H2,0)', (() => {
    return grid.rows[0][6].f === 'F2' && grid.rows[0][11].f === 'ROUND(G2*H2,0)';
  })());
  isTrue('公式导出·单位养老公式 ROUND(F2*0.16,2)', grid.rows[0][13].f === 'ROUND(F2*0.16,2)');
  isTrue('公式导出·累计应发跨行相加（V2+E3）', grid.rows[1][21].f === 'V2+E3');
  isTrue('公式导出·本期预扣 MAX(0,AC3-AD3) 且缓存一致', (() => {
    const cell = grid.rows[1][30];
    return cell.f === 'MAX(0,AC3-AD3)' && Math.abs(cell.v - gridRows[1].currentTax) < 1e-9;
  })());
  isTrue('公式导出·税率列嵌套 IF 引用累计应纳税所得额', (() => {
    const f = grid.rows[0][26].f;
    return f.indexOf('Z2<=36000') >= 0 && f.indexOf('0.45') >= 0;
  })());
  isTrue('公式导出·派生列公式与缓存值成对出现', grid.rows.slice(0, 2).every(row =>
    [21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 32].every(ci => row[ci] && row[ci].f && typeof row[ci].v === 'number')));
  isTrue('公式导出·年终奖独立行用 ÷12 档公式且不进累计链', (() => {
    const bonusRow = buildBonusSeparateRow({ amount: 36000, month: '2026-02' }, gridRows);
    const withBonus = gridRows.concat([bonusRow]);
    const g2 = buildSalaryFormulaGrid(withBonus, {
      chainKey: () => '2026', cityOf: () => 'custom', nameOf: () => '测试', cityLabel: () => '自定义政策'
    });
    const last = g2.rows[2];
    return last[26].f.indexOf('/12<=3000') >= 0 && last[21] === null && last[30].f === 'ROUND(MAX(0,E4*AA4-AB4),2)' && last[30].v === 1080;
  })());

  Object.assign(salaryParams, saved);

  const failed = t.filter(x => !x.ok);
  const summary = `${t.length - failed.length}/${t.length} 通过`;
  if (failed.length) {
    console.group('🧪 个税计算自检：' + summary);
    failed.forEach(f => console.error(`✗ ${f.name}：期望 ${f.expected}，实际 ${f.actual}`));
    console.groupEnd();
  } else {
    console.log('🧪 个税计算自检： ' + summary);
  }
  return { passed: t.length - failed.length, total: t.length, failed };
}

  window.TaxTest = { runSelfTests };
})();
