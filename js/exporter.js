/* ============================================================
 * exporter.js — Exporter 导出器
 * 职责：SheetJS 按需加载（ensureXLSX）、批量模板下载、
 *       工资薪金 Excel 公式明细网格构建（buildSalaryFormulaGrid）、多月/批量公式版导出。
 * 对外接口：window.Exporter。依赖：TaxEngine、PolicyLib、SocialIns、TaxState、TaxUtils。
 * ============================================================ */
(function () {
'use strict';
  const { round2, downloadFile } = TaxUtils;
  const { resolvePolicyMemo } = PolicyLib;

function ensureXLSX(cb) {
  if (typeof XLSX !== 'undefined') return cb();
  const s = document.createElement('script');
  s.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
  s.onload = () => cb();
  s.onerror = () => alert('SheetJS 库加载失败，请检查网络后重试');
  document.head.appendChild(s);
}

/** 工作簿 → 二进制 → 统一走 downloadFile：安全上下文弹「另存为」选位置，file:// 直接下载（与 CSV 行为一致） */
function saveWorkbook(wb, filename) {
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return downloadFile(data, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/** 批量模板下载：按所得类型给出对应的 CSV 样例 */
function downloadTemplate() {
  if (incomeType === 'salary') {
    const csv = '姓名,身份证号,月份,应发工资,城市,社保基数,公积金基数,公积金比例,专项附加扣除,年终奖\n张三,110101199001011234,2026-01,10000,广州,10000,10000,5,1000,\n张三,110101199001011234,2026-02,10000,广州,10000,10000,5,1000,36000\n李四,110101199202022345,2026-01,8000,深圳,8000,,12,,\n王五,110101199303033456,2026-01,9000,,,,,800,';
    downloadFile(csv, '工资薪金个税计算模板.csv', 'text/csv');
  } else {
    const csv = '月份,金额,姓名,身份证号,电话,银行卡号\n2024年11月,15000,张三,110101199001011234,13800138000,6225880112345678\n2024/12,20000,张三,110101199001011234,13800138000,6225880112345678\n2025-01,18000,张三,110101199001011234,13800138000,6225880112345678\n2025-02,22000,张三,110101199001011234,13800138000,6225880112345678\n2024.11,8000,李四,,,6225880198765432\n2024.12,12000,李四,,,6225880198765432\n2025-01,9500,李四,,,6225880198765432';
    downloadFile(csv, '个税计算模板.csv', 'text/csv');
  }
}

// ==================== Excel 公式明细导出（工资薪金） ====================

/* 列下标 → Excel 列字母（0→A, 26→AA） */
function colLetter(i) {
  let s = '';
  i += 1;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

/* 年度累计税率/速算扣除嵌套 IF（ref=累计应纳税所得额单元格），与 BRACKETS 一致 */
function fxAnnualRate(ref) {
  return `IF(${ref}<=36000,0.03,IF(${ref}<=144000,0.1,IF(${ref}<=300000,0.2,IF(${ref}<=420000,0.25,IF(${ref}<=660000,0.3,IF(${ref}<=960000,0.35,0.45))))))`;
}
function fxAnnualQuick(ref) {
  return `IF(${ref}<=36000,0,IF(${ref}<=144000,2520,IF(${ref}<=300000,16920,IF(${ref}<=420000,31920,IF(${ref}<=660000,52920,IF(${ref}<=960000,85920,181920))))))`;
}
/* 年终奖 ÷12 月度税率/速算扣除嵌套 IF（ref=奖金单元格），与 MONTHLY_BRACKETS 一致 */
function fxBonusRate(ref) {
  return `IF(${ref}/12<=3000,0.03,IF(${ref}/12<=12000,0.1,IF(${ref}/12<=25000,0.2,IF(${ref}/12<=35000,0.25,IF(${ref}/12<=55000,0.3,IF(${ref}/12<=80000,0.35,0.45))))))`;
}
function fxBonusQuick(ref) {
  return `IF(${ref}/12<=3000,0,IF(${ref}/12<=12000,210,IF(${ref}/12<=25000,1410,IF(${ref}/12<=35000,2660,IF(${ref}/12<=55000,4410,IF(${ref}/12<=80000,7160,15160))))))`;
}
/* 险种金额公式：ROUND(clamp(基数,上下限)×比例, digits)，上下限内联可溯源 */
function fxSiAmount(baseRef, item, rateExpr, digits) {
  let clamped = baseRef;
  if (item && item.upper != null) clamped = `MIN(${clamped},${item.upper})`;
  if (item && item.lower != null) clamped = `MAX(${clamped},${item.lower})`;
  return `ROUND(${clamped}*${rateExpr},${digits})`;
}

/**
 * 工资薪金「公式明细」网格构建（多月累计与批量共用）。
 * 常量列只有原始输入（应发、基数、比例、专项附加），派生值全部是 Excel 公式；
 * 每格同时写公式 f 与缓存值 v（页面已算出的结果）：打开即显示数值、点开可见公式来源、改输入自动重算。
 * @param {Array} rows 计算结果行（须含 _siDetail/_cumSI/_cumExtra/_isBonus 等）
 * @param {object} opts { idCard, phone, bankCard, nameOf, chainKey, cityOf, cityLabel, noteExtra }
 * @returns {{headers:string[], rows:Array<Array>, maxRow:number}}
 */
function buildSalaryFormulaGrid(rows, opts) {
  opts = opts || {};
  const showId = !!opts.idCard, showPhone = !!opts.phone, showBank = !!opts.bankCard;
  const headers = ['姓名'];
  if (showId) headers.push('身份证号');
  if (showPhone) headers.push('电话');
  if (showBank) headers.push('银行卡号');
  headers.push(
    '月份', '城市', '项目', '应发工资(税前)', '社保基数', '公积金基数', '公积金比例',
    '养老(个人)', '医疗(个人)', '失业(个人)', '公积金(个人)', '三险一金合计(个人)',
    '养老(单位)', '医疗(单位)', '失业(单位)', '工伤(单位)', '公积金(单位)', '单位合计',
    '专项附加扣除', '当月减除费用', '累计应发', '累计三险一金', '累计专项附加', '累计减除费用',
    '累计应纳税所得额', '适用税率', '速算扣除数', '累计应纳税额', '累计已预扣', '本期预扣税额',
    '实发工资', '企业用工总成本', '政策/备注'
  );
  let c = 0;
  const C = { name: c++ };
  if (showId) C.idCard = c++;
  if (showPhone) C.phone = c++;
  if (showBank) C.bankCard = c++;
  C.month = c++; C.city = c++; C.project = c++; C.amount = c++; C.socialBase = c++; C.fundBase = c++; C.fundRate = c++;
  C.pension = c++; C.medical = c++; C.unemployment = c++; C.fund = c++; C.siTotal = c++;
  C.erPension = c++; C.erMedical = c++; C.erUnemployment = c++; C.erInjury = c++; C.erFund = c++; C.erTotal = c++;
  C.extra = c++; C.deduct = c++; C.cumAmount = c++; C.cumSI = c++; C.cumExtra = c++; C.cumDeduct = c++;
  C.cumTaxable = c++; C.rate = c++; C.quick = c++; C.cumDue = c++; C.cumPaid = c++; C.curTax = c++;
  C.postTax = c++; C.cost = c++; C.note = c++;
  const col = (idx) => colLetter(idx);

  const out = [];
  let prevRow = null;
  let prevChain = null;
  rows.forEach(r => {
    const er = out.length + 2; // 当前行 Excel 行号（第 1 行为表头）
    const cityKey = opts.cityOf ? opts.cityOf(r) : salaryParams.cityId;
    const items = resolvePolicyMemo(cityKey, r.month).items || {};
    const si = r._siDetail || null;
    const isBonusSep = !!r._isBonus && r._bonusSeparate;
    const chainKey = opts.chainKey ? opts.chainKey(r) : '';
    const chainStart = !prevRow || chainKey !== prevChain;
    const sameMonth = !chainStart && prevRow && r.month === prevRow.month;
    const cell = (v, f) => (f ? { v: v, f: f } : { v: v });
    const num0 = (v) => (typeof v === 'number' && isFinite(v) ? round2(v) : 0);
    const cells = new Array(headers.length).fill(null);

    cells[C.name] = { v: opts.nameOf ? opts.nameOf(r) : (r.person || '本人') };
    if (showId) cells[C.idCard] = { v: r.idCard || '' };
    if (showPhone) cells[C.phone] = { v: r.phone || '' };
    if (showBank) cells[C.bankCard] = { v: r.bankCard || '' };
    cells[C.month] = { v: r.month || '' };
    cells[C.city] = { v: (opts.cityLabel ? opts.cityLabel(r) : (r.cityName || '')) };
    cells[C.project] = { v: r._isBonus ? '年终奖' : '工资' };
    cells[C.amount] = { v: num0(r.preTax) };

    /* 基数与比例（原始输入常量；公积金基数跟随社保时用公式引用以体现口径） */
    if (si && !isBonusSep) {
      cells[C.socialBase] = { v: num0(si.socialBaseRaw) };
      if (num0(si.fundBaseRaw) === num0(si.socialBaseRaw)) {
        cells[C.fundBase] = cell(num0(si.fundBaseRaw), `${col(C.socialBase)}${er}`);
      } else {
        cells[C.fundBase] = { v: num0(si.fundBaseRaw) };
      }
      cells[C.fundRate] = { v: num0(si.fundRateUsed) };
    } else {
      cells[C.socialBase] = { v: 0 };
      cells[C.fundBase] = { v: 0 };
      cells[C.fundRate] = { v: 0 };
    }

    /* 三险一金：个人部分（公积金按 ÷1 取整到元）与单位部分（含工伤） */
    if (si && !isBonusSep) {
      const baseRef = `${col(C.socialBase)}${er}`;
      const fundBaseRef = `${col(C.fundBase)}${er}`;
      const fundRateRef = `${col(C.fundRate)}${er}`;
      const pensionItem = items.pension || { personal: 0, lower: null, upper: null };
      const medicalItem = items.medical || pensionItem;
      const unemploymentItem = items.unemployment || pensionItem;
      const fundItem = items.fund || pensionItem;
      const injuryItem = items.injury || { personal: 0, lower: null, upper: null };
      const erRate = (k) => (items[k] && items[k].employer != null) ? items[k].employer : 0;
      cells[C.pension] = cell(si.pension, fxSiAmount(baseRef, pensionItem, pensionItem.personal || 0, 2));
      cells[C.medical] = cell(si.medical, fxSiAmount(baseRef, medicalItem, medicalItem.personal || 0, 2));
      cells[C.unemployment] = cell(si.unemployment, fxSiAmount(baseRef, unemploymentItem, unemploymentItem.personal || 0, 2));
      cells[C.fund] = cell(si.fund, fxSiAmount(fundBaseRef, fundItem, fundRateRef, 0));
      cells[C.siTotal] = cell(si.total, `SUM(${col(C.pension)}${er}:${col(C.fund)}${er})`);
      cells[C.erPension] = cell(si.employer.pension, fxSiAmount(baseRef, pensionItem, erRate('pension'), 2));
      cells[C.erMedical] = cell(si.employer.medical, fxSiAmount(baseRef, medicalItem, erRate('medical'), 2));
      cells[C.erUnemployment] = cell(si.employer.unemployment, fxSiAmount(baseRef, unemploymentItem, erRate('unemployment'), 2));
      cells[C.erInjury] = cell(si.employer.injury, fxSiAmount(baseRef, injuryItem, erRate('injury'), 2));
      const erFundRate = (items.fund && items.fund.employer != null) ? items.fund.employer : fundRateRef;
      cells[C.erFund] = cell(si.employer.fund, fxSiAmount(fundBaseRef, fundItem, erFundRate, 0));
      cells[C.erTotal] = cell(si.employer.total, `SUM(${col(C.erPension)}${er}:${col(C.erFund)}${er})`);
    } else {
      [C.pension, C.medical, C.unemployment, C.fund, C.siTotal,
        C.erPension, C.erMedical, C.erUnemployment, C.erInjury, C.erFund, C.erTotal].forEach(k => { cells[k] = { v: 0 }; });
    }

    /* 专项附加（原始输入）与减除费用 */
    cells[C.extra] = { v: num0(r.extraDeduction) };
    const deductFormula = `IF(${col(C.month)}${er}=${col(C.month)}${er - 1},0,5000)`;
    if (isBonusSep) {
      /* 年终奖单独计税行：不进入累计链 */
      cells[C.deduct] = null;
      cells[C.cumAmount] = null;
      cells[C.cumSI] = null;
      cells[C.cumExtra] = null;
      cells[C.cumDeduct] = null;
      cells[C.cumTaxable] = null;
      cells[C.rate] = cell(r.rate, fxBonusRate(`${col(C.amount)}${er}`));
      cells[C.quick] = cell(r.quick, fxBonusQuick(`${col(C.amount)}${er}`));
      cells[C.cumDue] = null;
      cells[C.cumPaid] = null;
      cells[C.curTax] = cell(r.currentTax, `ROUND(MAX(0,${col(C.amount)}${er}*${col(C.rate)}${er}-${col(C.quick)}${er}),2)`);
      cells[C.postTax] = cell(r.postTax, `${col(C.amount)}${er}-${col(C.curTax)}${er}`);
    } else {
      cells[C.deduct] = chainStart
        ? cell(5000)
        : cell(sameMonth ? 0 : 5000, deductFormula);
      cells[C.cumAmount] = chainStart
        ? cell(r.cumIncome, `${col(C.amount)}${er}`)
        : cell(r.cumIncome, `${col(C.cumAmount)}${er - 1}+${col(C.amount)}${er}`);
      cells[C.cumSI] = chainStart
        ? cell(r._cumSI || 0, `${col(C.siTotal)}${er}`)
        : cell(r._cumSI || 0, sameMonth
          ? `${col(C.cumSI)}${er - 1}`
          : `${col(C.cumSI)}${er - 1}+${col(C.siTotal)}${er}`);
      cells[C.cumExtra] = chainStart
        ? cell(r._cumExtra || 0, `${col(C.extra)}${er}`)
        : cell(r._cumExtra || 0, sameMonth
          ? `${col(C.cumExtra)}${er - 1}`
          : `${col(C.cumExtra)}${er - 1}+${col(C.extra)}${er}`);
      cells[C.cumDeduct] = chainStart
        ? cell(r.cumDeduction || 0, `${col(C.deduct)}${er}`)
        : cell(r.cumDeduction || 0, sameMonth
          ? `${col(C.cumDeduct)}${er - 1}`
          : `${col(C.cumDeduct)}${er - 1}+${col(C.deduct)}${er}`);
      cells[C.cumTaxable] = cell(r.taxableIncome || 0,
        `MAX(0,${col(C.cumAmount)}${er}-${col(C.cumSI)}${er}-${col(C.cumExtra)}${er}-${col(C.cumDeduct)}${er})`);
      cells[C.rate] = cell(r.rate, fxAnnualRate(`${col(C.cumTaxable)}${er}`));
      cells[C.quick] = cell(r.quick, fxAnnualQuick(`${col(C.cumTaxable)}${er}`));
      cells[C.cumDue] = cell(r.cumTaxDue || 0,
        `ROUND(MAX(0,ROUND(${col(C.cumTaxable)}${er}*${col(C.rate)}${er}-${col(C.quick)}${er},2)),2)`);
      cells[C.cumPaid] = chainStart
        ? { v: 0 }
        : cell(num0((prevRow.cumTaxDue || 0) - (prevRow.currentTax || 0)),
          `${col(C.cumPaid)}${er - 1}+${col(C.curTax)}${er - 1}`);
      cells[C.curTax] = cell(r.currentTax || 0, `MAX(0,${col(C.cumDue)}${er}-${col(C.cumPaid)}${er})`);
      cells[C.postTax] = cell(r.postTax, `${col(C.amount)}${er}-${col(C.siTotal)}${er}-${col(C.curTax)}${er}`);
    }
    cells[C.cost] = cell(num0(r.preTax) + (si && si.employer ? si.employer.total : 0),
      `${col(C.amount)}${er}+${col(C.erTotal)}${er}`);
    cells[C.note] = { v: opts.noteExtra ? (opts.noteExtra(r) || '') : '' };

    out.push(cells);
    prevRow = r;
    prevChain = chainKey;
  });

  return { headers: headers, rows: out, maxRow: out.length + 1 };
}

/** 网格 → SheetJS 工作表（f 公式 + v 缓存值） */
function gridToWorksheet(grid) {
  const ws = {};
  const put = (excelRow, cIdx, cell) => {
    if (!cell) return;
    const addr = colLetter(cIdx) + excelRow;
    const isNum = typeof cell.v === 'number';
    const c = { t: isNum ? 'n' : 's', v: isNum ? round2(cell.v) : cell.v };
    if (cell.f) c.f = cell.f;
    ws[addr] = c;
  };
  grid.headers.forEach((h, ci) => put(1, ci, { v: h }));
  grid.rows.forEach((row, ri) => {
    row.forEach((cell, ci) => put(ri + 2, ci, cell));
  });
  let maxC = grid.headers.length - 1;
  grid.rows.forEach(row => {
    for (let i = row.length - 1; i >= 0; i--) { if (row[i]) { maxC = Math.max(maxC, i); break; } }
  });
  ws['!ref'] = 'A1:' + colLetter(maxC) + Math.max(1, grid.maxRow);
  ws['!cols'] = grid.headers.map(h => ({ wch: Math.min(24, Math.max(9, String(h).length * 1.9)) }));
  return ws;
}

/** 多月累计 → Excel 公式明细 */
function exportMultiExcelFormula() {
  if (incomeType !== 'salary') return alert('公式明细导出目前支持「工资薪金」模式');
  const results = window._multiResults;
  if (!results || !results.length) return alert('请先计算');
  return ensureXLSX(() => {
    const grid = buildSalaryFormulaGrid(results, {
      nameOf: () => '本人',
      chainKey: (r) => String(r.month || '').split('-')[0],
      cityOf: () => salaryParams.cityId,
      cityLabel: (r) => {
        const pol = resolvePolicyMemo(salaryParams.cityId, r.month);
        return pol.label + (r._yearFallback ? '（年度未匹配）' : '');
      },
      noteExtra: (r) => {
        const parts = [];
        if (multiDirection === 'reverse') parts.push('应发为税后反算值');
        if (r._isBonus) parts.push(r._bonusSeparate ? '年终奖单独计税（÷12 定档）' : '年终奖并入综合所得');
        return parts.join('；');
      }
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, gridToWorksheet(grid), '工资计算明细');
    return saveWorkbook(wb, '多月工资个税明细(公式版).xlsx');
  });
}

/** 批量 → Excel 公式明细（换人/跨年自动重置累计公式基准） */
function exportBatchExcelFormula() {
  if (incomeType !== 'salary') return alert('公式明细导出目前支持「工资薪金」模式');
  const results = window._batchResults;
  if (!results || !results.length) return alert('请先计算');
  return ensureXLSX(() => {
    const grid = buildSalaryFormulaGrid(results, {
      idCard: results.some(r => r.idCard),
      phone: results.some(r => r.phone),
      bankCard: results.some(r => r.bankCard),
      nameOf: (r) => r.person || '',
      chainKey: (r) => (r.person || '') + '|' + String(r.month || '').split('-')[0],
      cityOf: (r) => r._cityKey || salaryParams.cityId,
      cityLabel: (r) => r.cityName || '',
      noteExtra: (r) => {
        const parts = [];
        if (r.policyYearLabel) parts.push(r.policyYearLabel);
        if (batchDirection === 'reverse') parts.push('应发为税后反算值');
        if (r._isBonus) parts.push(r._bonusStrategy === 'combined' ? '年终奖并入综合所得' : '年终奖单独计税（÷12 定档）');
        if (r._siMissing) parts.push('三险一金未设置基数，按 0 计');
        return parts.join('；');
      }
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, gridToWorksheet(grid), '批量工资明细');
    return saveWorkbook(wb, '批量工资个税明细(公式版).xlsx');
  });
}


  window.Exporter = { buildSalaryFormulaGrid,colLetter,downloadTemplate,ensureXLSX,exportBatchExcelFormula,exportMultiExcelFormula,fxAnnualQuick,fxAnnualRate,fxBonusQuick,fxBonusRate,fxSiAmount,gridToWorksheet,saveWorkbook };
})();
