/* ============================================================
 * page-batch.js — PageBatch 批量计算页
 * 职责：文件解析（CSV/Excel/GBK）、智能表格识别、列映射、批量流水线、结果渲染、CSV 导出。
 * 对外接口：window.PageBatch。依赖：TaxEngine/PolicyLib/SocialIns/UI/Exporter/TaxState/TaxUtils。
 * ============================================================ */
(function () {
'use strict';
  const { formatRate, parseAmount, parseFundRate, round2, formatNum, downloadFile } = TaxUtils;
  const { calcBonusTaxSeparate, calcTaxForward, calcTaxReverse, calcTaxOldPolicy, calcTaxReverseOldPolicy,
    getMonthlyBracket, isGapMonth, isNewPolicy, TAX_STRATEGIES } = TaxEngine;
  const { getExtraDeductionFor, computeSocialInsuranceDetail } = SocialIns;
  const { CITY_POLICY_LIBRARY, findCityKey, resolvePolicyMemo } = PolicyLib;
  const { ensureXLSX, exportBatchExcelFormula } = Exporter;
  const { calcTaxByDirection, gapResetRowHTML, identityFlagsOf, incomeIOLabels,
    insertBonusRowSorted, oldPolicyRowHTML, siEmployerTooltip, siEmployerTotal, yearResetRowHTML } = PageShared;

// ==================== Batch calc ====================

const uploadArea = document.getElementById('upload-area');
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const files = e.dataTransfer.files;
  if (files.length) handleFiles(files);
});

function handleFile(e) {
  if (e.target.files.length) handleFiles(e.target.files);
}

// 多文件处理队列 — 支持分批累加
let _pendingFiles = 0;
let _accumRows = [];
let _accumFileCount = 0;   // 已累加的文件数
let _accumSources = [];
let _previewSourceId = '';

function handleFiles(fileList) {
  // 不再清空 _accumRows，实现分批累加
  const files = Array.from(fileList);
  _pendingFiles += files.length;
  _accumFileCount += files.length;
  updateAccumIndicator();
  files.forEach(f => processFile(f));
}

function updateAccumIndicator() {
  const el = document.getElementById('accum-indicator');
  if (_accumFileCount > 0) {
    const selectedSources = _accumSources.filter(s => s.selected);
    el.style.display = '';
    el.textContent = ` 已累加 ${_accumFileCount} 个文件（${selectedSources.length} 个已选数据表，${_accumRows.length} 行数据），可继续上传更多文件`;
  } else {
    el.style.display = 'none';
  }
}

function processFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = e => {
      let text = e.target.result;
      if (isGarbled(text)) {
        const reader2 = new FileReader();
        reader2.onload = e2 => {
          _accumSources.push(buildSourceItem({
            type: 'csv',
            fileName: file.name,
            rows: parseCSV(e2.target.result),
            selected: true
          }));
          onFileParsed();
        };
        reader2.readAsText(file, 'gbk');
      } else {
        _accumSources.push(buildSourceItem({
          type: 'csv',
          fileName: file.name,
          rows: parseCSV(text),
          selected: true
        }));
        onFileParsed();
      }
    };
    reader.readAsText(file, 'utf-8');
  } else if (['xlsx', 'xls'].includes(ext)) {
    ensureXLSX(() => readExcel(file));
  } else {
    alert('不支持的文件格式，请上传 CSV 或 Excel 文件');
    _pendingFiles--;
  }
}

function readExcel(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, { type: 'array' });
    const sheetItems = analyzeWorkbookSheets(wb, file.name);
    sheetItems.forEach(item => _accumSources.push(item));
    onFileParsed();
  };
  reader.readAsArrayBuffer(file);
}

function onFileParsed() {
  _pendingFiles--;
  if (_pendingFiles <= 0) {
    refreshBatchPreview();
    document.getElementById('file-input').value = '';
  }
}

function buildSourceItem({ type, fileName, sheetName = '', rows = [], selected = true, analysis = null }) {
  return {
    id: `${type}:${fileName}:${sheetName || 'default'}:${Math.random().toString(36).slice(2, 8)}`,
    type,
    fileName,
    sheetName,
    rows,
    selected,
    analysis
  };
}

function refreshBatchPreview() {
  const selectedRows = collectSelectedRows();
  _accumRows = selectedRows;
  updateAccumIndicator();

  const container = document.getElementById('batch-preview');
  const resultBox = document.getElementById('batch-result');
  resultBox.style.display = 'none';

  if (selectedRows.length === 0) {
    const sourceHTML = renderSourceSelectionHTML(_accumSources);
    container.style.display = '';
    container.innerHTML = `
      <div class="card" style="border-color:var(--t-border);">
        <div class="card-title"><span class="icon">${UI.icon("alert-triangle")}</span> 未选择可导入的数据表</div>
        <div style="font-size:14px;color:var(--t-text-2);">请至少勾选一个包含有效数据的 CSV 或 Sheet。</div>
        ${sourceHTML}
      </div>
    `;
    return;
  }

  const previewRows = collectPreviewRows();
  const { headerRow, headerRowIndex, dataRows } = smartDetectTable(previewRows);
  const label = buildBatchSourceLabel();
  showColumnMappingUI(previewRows, headerRow, headerRowIndex, dataRows, label, _accumSources, selectedRows);
}

function collectSelectedRows() {
  const rows = [];
  _accumSources.filter(s => s.selected).forEach(source => {
    rows.push(...tagSourceRows(source));
  });
  return rows;
}

function collectPreviewRows() {
  const selectedSources = _accumSources.filter(s => s.selected);
  if (!selectedSources.length) return [];

  let previewSource = selectedSources.find(s => s.id === _previewSourceId);
  if (!previewSource) {
    previewSource = selectedSources[0];
    _previewSourceId = previewSource.id;
  }

  const rows = [];
  rows.push(...tagSourceRows(previewSource));
  return rows;
}

function tagSourceRows(source) {
  const rows = [];
  source.rows.forEach((row, idx) => {
    const tagged = Array.isArray(row) ? row.slice() : [row];
    tagged._sourceId = source.id;
    tagged._sheetName = source.sheetName || '';
    tagged._fileName = source.fileName || '';
    tagged._sheetMonthHint = source.analysis?.monthHint || '';
    tagged._sourceRowIndex = idx;
    rows.push(tagged);
  });
  return rows;
}

function buildBatchSourceLabel() {
  const selectedSources = _accumSources.filter(s => s.selected);
  const fileCount = new Set(selectedSources.map(s => s.fileName)).size;
  const sheetCount = selectedSources.filter(s => s.type === 'excel-sheet').length;
  if (sheetCount > 0) {
    return `${fileCount} 个文件 / ${selectedSources.length} 个数据表`;
  }
  return fileCount > 1 ? `${fileCount} 个文件合并` : (selectedSources[0]?.fileName || '批量数据');
}

function resetBatch() {
  _pendingFiles = 0;
  _accumRows = [];
  _accumSources = [];
  _previewSourceId = '';
  _accumFileCount = 0;
  window._batchParsed = null;
  window._batchFilename = null;
  window._batchResults = null;
  window._colMappingState = null;
  document.getElementById('batch-preview').style.display = 'none';
  document.getElementById('batch-result').style.display = 'none';
  document.getElementById('file-input').value = '';
  updateAccumIndicator();
  batchDirection = 'forward';
  batchGapReset = true;
}

function toggleRows(btn, selector) {
  const rows = document.querySelectorAll(selector);
  const hidden = rows[0]?.style.display === 'none';
  rows.forEach(r => r.style.display = hidden ? '' : 'none');
  btn.textContent = hidden ? '收起' : '展开全部';
}

function togglePersonTable(btn) {
  toggleRows(btn, '.person-extra');
}

function togglePreviewTable(btn) {
  toggleRows(btn, '.preview-extra');
}

function parseCSV(text) {
  return text.split(/\r?\n/).map(line => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }).filter(row => row.some(cell => cell !== ''));
}

/**
 * 检测 UTF-8 解码是否产生乱码（GBK 文件误用 UTF-8 读取）
 */
function isGarbled(text) {
  // GBK 编码的中文用 UTF-8 读取会出现大量替换字符或无意义字节
  const garbledPattern = /[\uFFFD]{2,}|[Ã¯Â¿Â½]{3,}|[éèêë]{3,}[àáâãäå]{2,}/;
  if (garbledPattern.test(text)) return true;
  // 检测：如果文本包含大量非 CJK 也非 ASCII 的字符，大概率是乱码
  let suspicious = 0;
  for (let i = 0; i < Math.min(text.length, 500); i++) {
    const code = text.charCodeAt(i);
    if (code > 255 && !(code >= 0x4E00 && code <= 0x9FFF) && !(code >= 0x3000 && code <= 0x303F)) {
      suspicious++;
    }
  }
  return suspicious > 10;
}

/** Excel 日期序列号 → Date（1900 日期系统，按 1899-12-30 纪元折算） */
function excelSerialToDate(serial) {
  const epoch = new Date(1899, 11, 30);
  return new Date(epoch.getTime() + serial * 86400000);
}

/**
 * 标准化月份格式为 YYYY-MM
 * 支持：2024-01, 2024/01, 2024年1月, 2024.01, 202401, 1月, Excel序列号 等
 */
function normalizeMonth(raw) {
  if (!raw || raw === '-') return '-';
  let s = String(raw).trim();

  // Excel 序列号（纯数字，大于 40000 约为 2009 年之后）
  if (/^\d{5,}$/.test(s)) {
    const serial = parseInt(s);
    if (serial > 30000 && serial < 60000) {
      const d = excelSerialToDate(serial);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
  }

  // 2024年1月 / 2024年01月
  let m = s.match(/(\d{4})\s*年\s*(\d{1,2})\s*月?/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;

  // 1月 / 01月（当年）
  m = s.match(/^(\d{1,2})\s*月$/);
  if (m) {
    const year = new Date().getFullYear();
    return `${year}-${m[1].padStart(2, '0')}`;
  }

  // Dec-24 / Jan-25 / Feb-25 等 Excel 英文月份缩写
  const MONTH_EN = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
                     jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
  m = s.match(/^([A-Za-z]{3})[-\/.\s]?(\d{2,4})$/);
  if (m) {
    const monKey = m[1].toLowerCase();
    const monNum = MONTH_EN[monKey];
    if (monNum) {
      let yr = parseInt(m[2]);
      if (yr < 100) yr += 2000;
      return `${yr}-${monNum}`;
    }
  }

  // 2024-01, 2024/01, 2024.01, 202401，也支持后面带时间的
  m = s.match(/^(\d{4})[-\/.\s]?(\d{1,2})(?:[-\/.\s]?\d{1,2})?(?:\s+\d{1,2}:\d{1,2}(?::\d{1,2})?)?$/);
  if (m && parseInt(m[2]) >= 1 && parseInt(m[2]) <= 12) return `${m[1]}-${m[2].padStart(2, '0')}`;

  // 2024-01-15 / 2024/01/15（取年月），也支持后面带时间的
  m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:\s+\d{1,2}:\d{1,2}(?::\d{1,2})?)?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;

  // 兜底：原样返回
  return s;
}

/**
 * 比较两个 YYYY-MM 格式的月份字符串，用于排序
 */
function compareMonth(a, b) {
  if (a === '-') return 1;
  if (b === '-') return -1;
  return a.localeCompare(b);
}

function extractMonthHint(text) {
  if (!text) return '';
  const raw = String(text).trim();
  // 纯小数数值（如金额 2018.6）会被 "YYYY.M" 点分年月模式误判，直接排除
  if (/^\d+\.\d+$/.test(raw)) return '';
  const patterns = [
    /(?:^|[^\d])(20\d{2}\s*年\s*\d{1,2}\s*月)(?:[^\d]|$)/,
    /(?:^|[^\d])(20\d{2}[-\/.]\d{1,2})(?:[-\/.]\d{1,2})?(?:\s+\d{1,2}:\d{1,2}(?::\d{1,2})?)?(?:[^\d]|$)/,
    /(?:^|[^\d])((?:20\d{2})(?:0[1-9]|1[0-2]))(?:[^\d]|$)/
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (!m) continue;
    const normalized = normalizeMonth(m[1]);
    if (/^\d{4}-\d{2}$/.test(normalized)) return normalized;
  }
  return '';
}

function extractYearHint(text) {
  if (!text) return '';
  const raw = String(text).trim();
  // 长纯数字串（身份证号/银行卡号/金额）中的 "20xx" 子串不是年份提示
  if (/^\d+(\.\d+)?$/.test(raw) && (raw.includes('.') || raw.length > 6)) return '';
  const m = raw.match(/(20\d{2})/);
  return m ? m[1] : '';
}

function buildMonthFromParts(yearHint, monthValue) {
  const monthNum = parseInt(monthValue, 10);
  if (!yearHint || !(monthNum >= 1 && monthNum <= 12)) return '';
  return `${yearHint}-${String(monthNum).padStart(2, '0')}`;
}

function normalizeMonthWithHint(raw, monthHint = '') {
  const normalized = normalizeMonth(raw);
  if (/^\d{4}-\d{2}$/.test(normalized)) return normalized;
  const rawText = String(raw || '').trim();
  if (/^\d{1,2}$/.test(rawText)) {
    const yearHint = extractYearHint(monthHint);
    const built = buildMonthFromParts(yearHint, rawText);
    if (built) return built;
  }
  return normalized;
}

function extractSortDateTime(raw) {
  if (!raw) return '';
  const text = String(raw).trim();
  if (!text) return '';

  // Excel serial date/time
  if (/^\d{5,}(\.\d+)?$/.test(text)) {
    const serial = parseFloat(text);
    if (serial > 30000 && serial < 60000) {
      const d = excelSerialToDate(serial);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
    }
  }

  let m = text.match(/(20\d{2})[-\/.年](\d{1,2})[-\/.月](\d{1,2})(?:[日\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) {
    const yyyy = m[1];
    const mm = m[2].padStart(2, '0');
    const dd = m[3].padStart(2, '0');
    const hh = String(m[4] || '00').padStart(2, '0');
    const mi = String(m[5] || '00').padStart(2, '0');
    const ss = String(m[6] || '00').padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  }

  return '';
}

function extractMonthHintFromRows(rows, fallbackYear = '') {
  const scanRows = (rows || []).slice(0, 20);
  let yearHint = fallbackYear || '';

  for (const row of scanRows) {
    for (const cell of row || []) {
      const text = String(cell || '').trim();
      if (!text) continue;
      if (!yearHint) yearHint = extractYearHint(text);
      const hint = extractMonthHint(text);
      if (hint) return hint;
    }
  }

  for (let ri = 0; ri < scanRows.length - 1; ri++) {
    const row = scanRows[ri] || [];
    const nextRow = scanRows[ri + 1] || [];
    for (let ci = 0; ci < row.length; ci++) {
      const cell = row[ci];
      const text = String(cell || '').trim();
      if (!/月份|month|期间|发放月/i.test(text)) continue;
      const current = row[ci + 1];
      const next = nextRow[ci];
      const nextRight = nextRow[ci + 1];
      for (const candidate of [current, next, nextRight]) {
        const raw = String(candidate || '').trim();
        if (!raw) continue;
        const direct = extractMonthHint(raw);
        if (direct) {
          yearHint = extractYearHint(direct) || yearHint;
          return direct;
        }
      }
      const numericCandidate = [current, next, nextRight].find(candidate => /^\d{1,2}$/.test(String(candidate || '').trim()));
      if (numericCandidate && yearHint) {
        const built = buildMonthFromParts(yearHint, numericCandidate);
        if (built) return built;
      }
    }
  }

  return '';
}

function sanitizeIdCard(value) {
  const v = String(value || '').trim().toUpperCase();
  return /^\d{17}[\dX]$/.test(v) ? v : '';
}

function sanitizePhone(value) {
  const v = String(value || '').replace(/\D/g, '');
  return /^1[3-9]\d{9}$/.test(v) ? v : '';
}

function sanitizeBankCard(value) {
  const v = String(value || '').replace(/\s+/g, '');
  return /^\d{16,19}$/.test(v) ? v : '';
}

function sanitizeName(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/合计|总计|汇总|平台服务费|服务费率|开票|税源地|业务类型/i.test(v)) return '';
  if (/^\d+(\.\d+)?$/.test(v)) return '';
  return v;
}

function rowHasUsableIdentity({ name, idCard, phone, bankCard }) {
  const cleanName = sanitizeName(name);
  return !!((cleanName && cleanName !== '默认') || sanitizeIdCard(idCard) || sanitizePhone(phone) || sanitizeBankCard(bankCard));
}

function isSummaryLikeText(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return /合计|总计|汇总|小计|平台服务费|服务费率|服务费|开票金额|客户支付合计|收费通知/i.test(text);
}

function isSummaryLikeRow(row) {
  if (!Array.isArray(row)) return false;
  const cells = row.map(cell => String(cell || '').trim()).filter(Boolean);
  if (!cells.length) return false;
  const summaryHits = cells.filter(isSummaryLikeText).length;
  if (!summaryHits) return false;

  const hasIdentity = cells.some(cell =>
    sanitizeIdCard(cell) || sanitizePhone(cell) || sanitizeBankCard(cell) || (!!sanitizeName(cell) && !isSummaryLikeText(cell))
  );

  return !hasIdentity;
}

function isAmountLikeNumber(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return false;
  const compact = raw.replace(/,/g, '');
  if (/^\d{11}$/.test(compact)) return false;
  if (/^\d{16,19}$/.test(compact)) return false;
  if (/^\d{17}[\dXx]$/.test(compact)) return false;
  const num = parseFloat(compact);
  return !isNaN(num) && isFinite(num) && num > 0 && num < 1e8;
}

function isAmountHeaderExcluded(header) {
  return /方式|类型|选择|状态|税源地|开户|账号|账户|手机号|电话|身份证|证件|银行|备注|说明|业务|三险一金|五险一金|社保|公积金|专项附加|基数/.test(header);
}

function getAmountColumnScore(header, dataRows, ci) {
  const headerText = String(header || '').trim();
  if (!headerText || isAmountHeaderExcluded(headerText)) return -Infinity;

  let score = 0;
  if (/应发金额|实发金额|应发工资|实发工资|客户支付合计|税前收入|税后收入|发放金额|报酬|工资|月薪/i.test(headerText)) score += 9;
  else if (/金额|amount|收入额|合计金额|应付金额/i.test(headerText)) score += 6;
  else if (/累计收入/i.test(headerText)) score += 3;
  if (/含税|应付|收入|pay|income/i.test(headerText)) score += 2;
  if (/发放方式|服务费率|税源地/i.test(headerText)) score -= 10;
  if (/三险一金|五险一金|社保|公积金|专项附加|基数/i.test(headerText)) score -= 10;

  const sampleRows = dataRows.slice(0, 12);
  if (!sampleRows.length) return score;

  let amountHits = 0;
  sampleRows.forEach(row => {
    if (isAmountLikeNumber(row?.[ci])) amountHits++;
  });
  const ratio = amountHits / sampleRows.length;
  score += ratio * 8;
  if (ratio < 0.35) score -= 8;
  return score;
}

function getSheetNameScore(sheetName) {
  const name = String(sheetName || '');
  let score = 0;
  if (/(工资|薪资|报酬|劳务|个税|结算|收入|明细|台账|收费|发放|salary|pay|income|detail)/i.test(name)) score += 8;
  if (/(汇总|总表|合计|说明|模板|示例|图表|透视|pivot|summary|chart|cover|封面|备份|backup)/i.test(name)) score -= 12;
  if (extractMonthHint(name)) score += 6;
  return score;
}

function scoreDataCoverage(headerRow, dataRows, autoMap) {
  const sampleRows = dataRows.slice(0, 50);
  if (!sampleRows.length) return { score: 0, amountRate: 0, monthRate: 0, identityRate: 0 };

  let amountHits = 0;
  let monthHits = 0;
  let identityHits = 0;

  sampleRows.forEach(row => {
    const valOf = (colKey) => {
      const idx = autoMap[colKey];
      return (idx != null && autoMap.cols && autoMap.cols[idx]) ? row[idx] : '';
    };

    if (isAmountLikeNumber(valOf('amountCol'))) amountHits++;

    const normalizedMonth = normalizeMonth(valOf('monthCol') || '');
    if (/^\d{4}-\d{2}$/.test(normalizedMonth)) monthHits++;

    if (
      /^\d{17}[\dXx]$/.test(String(valOf('idCardCol') || '').trim()) ||
      /^1[3-9]\d{9}$/.test(String(valOf('phoneCol') || '').trim()) ||
      /^\d{16,19}$/.test(String(valOf('bankCardCol') || '').trim()) ||
      String(valOf('nameCol') || '').trim()
    ) {
      identityHits++;
    }
  });

  const amountRate = amountHits / sampleRows.length;
  const monthRate = monthHits / sampleRows.length;
  const identityRate = identityHits / sampleRows.length;
  let score = 0;
  if (sampleRows.length >= 3) score += 8;
  if (sampleRows.length >= 10) score += 4;
  score += Math.round(amountRate * 18);
  score += Math.round(monthRate * 14);
  score += Math.round(identityRate * 12);

  return { score, amountRate, monthRate, identityRate };
}

function analyzeSheet(sheetName, rows, workbookMonthHint = '', workbookYearHint = '') {
  const nonEmptyRows = (rows || []).filter(row => row.some(cell => String(cell || '').trim() !== ''));
  if (!nonEmptyRows.length) {
    return {
      sheetName,
      rows: [],
      score: -999,
      monthHint: extractMonthHint(sheetName) || workbookMonthHint,
      dataRowsCount: 0,
      headerRowIndex: 0,
      autoMap: { cols: {}, amountType: 'preTax' }
    };
  }

  const { headerRow, headerRowIndex, dataRows } = smartDetectTable(nonEmptyRows);
  const autoMap = detectColumnMapping(headerRow, dataRows);

  let headerScore = 0;
  const typedCols = Object.entries(autoMap.cols || {}).filter(([, col]) => col.type);
  typedCols.forEach(([, col]) => {
    if (col.type === 'amount') headerScore += 25;
    else if (col.type === 'month') headerScore += 18;
    else headerScore += 10;
  });

  const reverseMap = {};
  Object.entries(autoMap.cols || {}).forEach(([ci, col]) => {
    if (col.type && reverseMap[col.type] == null) reverseMap[col.type] = Number(ci);
  });
  autoMap.amountCol = reverseMap.amount;
  autoMap.monthCol = reverseMap.month;
  autoMap.nameCol = reverseMap.name;
  autoMap.idCardCol = reverseMap.idCard;
  autoMap.phoneCol = reverseMap.phone;
  autoMap.bankCardCol = reverseMap.bankCard;

  const coverage = scoreDataCoverage(headerRow, dataRows, autoMap);
  const nameScore = getSheetNameScore(sheetName);
  const monthHint = extractMonthHint(sheetName) || extractMonthHintFromRows(nonEmptyRows, workbookYearHint) || workbookMonthHint;
  const score = headerScore + coverage.score + nameScore + (monthHint ? 4 : 0);

  return {
    sheetName,
    rows: nonEmptyRows,
    score,
    headerScore,
    dataScore: coverage.score,
    nameScore,
    monthHint,
    dataRowsCount: dataRows.length,
    headerRowIndex,
    autoMap,
    amountRate: coverage.amountRate,
    monthRate: coverage.monthRate,
    identityRate: coverage.identityRate
  };
}

function analyzeWorkbookSheets(wb, fileName) {
  let workbookMonthHint = extractMonthHint(fileName);
  let workbookYearHint = extractYearHint(fileName);
  if (!workbookMonthHint || !workbookYearHint) {
    outer:
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }).slice(0, 20);
      for (const row of rows) {
        for (const cell of row || []) {
          const text = String(cell || '').trim();
          if (!text) continue;
          if (!workbookYearHint) workbookYearHint = extractYearHint(text) || workbookYearHint;
          if (!workbookMonthHint) workbookMonthHint = extractMonthHint(text) || workbookMonthHint;
          if (workbookMonthHint && workbookYearHint) break outer;
        }
      }
    }
  }

  const analyzed = wb.SheetNames.map(sheetName => {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
    return analyzeSheet(sheetName, rows, workbookMonthHint, workbookYearHint);
  }).filter(item => item.rows.length > 0);

  if (!analyzed.length) return [];

  analyzed.sort((a, b) => b.score - a.score);
  const topScore = analyzed[0].score;
  let selected = analyzed.filter(item =>
    item.score >= 45 &&
    item.dataRowsCount >= 2 &&
    item.score >= topScore - 10 &&
    !/(汇总|总表|说明|模板|图表|透视|summary|chart|cover|封面)/i.test(item.sheetName)
  );

  if (!selected.length) selected = [analyzed[0]];
  const selectedNames = new Set(selected.map(item => item.sheetName));

  return analyzed.map(item => buildSourceItem({
    type: 'excel-sheet',
    fileName,
    sheetName: item.sheetName,
    rows: item.rows,
    selected: selectedNames.has(item.sheetName),
    analysis: item
  }));
}

// ==================== Smart Table Detection ====================

/**
 * 列识别关键词配置，按优先级从高到低排序
 */
const COL_KEYWORDS = [
  {
    type: 'name',
    patterns: [
      /^(姓名|户名|人员|收款人|员工|name|person)$/i,           // 高优先级：精确匹配
      /(^|\s|_|-)姓名(^|\s|_|-$)/i, /(^|\s|_|-)员工(^|\s|_|-$)/i, /(^|\s|_|-)人员(^|\s|_|-$)/i,  // 独立出现的关键词
      /姓名|员工|人员|收款人|person/i                           // 中优先级：包含关键词
    ],
    exclude: /公司|单位|企业|机构|部门|集体|组织|集团/i       // 排除公司类名称
  },
  {
    type: 'month',
    patterns: [
      /^(月份|month|期间|时间|日期|date|发放月|所属月)$/i,
      /月份|month|期间|时间|日期|date|发放月|所属月/i
    ],
    exclude: null
  },
  {
    type: 'amount',
    patterns: [
      /^(金额|amount|收入|income|报酬|pay|实发金额?|税前收入?|税后收入?|应发金额?|应付金额?|应发工资|实发工资|工资|月薪|基本工资|客户支付合计|累计收入|收入额|发放金额|合计金额|服务预算|付款金额|计划发放收入)$/i,
      /金额|amount|收入|income|报酬|pay|实发|税前|税后|应发|应付|工资|月薪|发放|合计|预算|付款/i
    ],
    exclude: null
  },
  {
    type: 'socialBase',
    patterns: [
      /^(社保基数|社保缴费基数|社保缴费工资基数|社会保险基数|缴费工资基数)$/i,
      /社保.{0,6}基数|社会保险.{0,6}基数|缴费(工资)?基数/i
    ],
    exclude: /公积金/i
  },
  {
    type: 'fundBase',
    patterns: [
      /^(公积金基数|公积金缴费基数|住房公积金基数|公积金缴费工资基数)$/i,
      /公积金.{0,6}基数|住房公积金.{0,6}基数/i
    ],
    exclude: null
  },
  {
    type: 'fundRate',
    patterns: [
      /^(公积金比例|公积金缴存比例|公积金个人比例|住房公积金比例|公积金缴存档|缴存比例|公积金档位|个人缴存比例)$/i,
      /公积金.{0,8}(比例|档)/i
    ],
    exclude: /基数/i
  },
  {
    type: 'bonus',
    patterns: [
      /^(年终奖|年终奖金|全年一次性奖金|年度奖金|年终奖励|年终花红|bonus|annual\s*bonus)$/i,
      /年终奖|年度奖金|一次性奖金|年终花红/i
    ],
    exclude: /工资|月薪|基数|比例|月度|季度|绩效/i
  },
  {
    type: 'extraDeduction',
    patterns: [
      /^(专项附加扣除|专项附加|附加扣除)$/i,
      /专项附加|附加扣除/i
    ],
    exclude: /社保|公积金|三险|五险/i
  },
  {
    type: 'city',
    patterns: [
      /^(城市|参保地|缴纳地|工作城市|参保城市|社保城市)$/i,
      /城市|参保地|缴纳地/i
    ],
    exclude: null
  },
  {
    type: 'idCard',
    patterns: [
      /^(身份证|身份证号|身份证号码|id\s*card|idcard|证件号)$/i,
      /身份证|身份证号|id\s*card|idcard|证件号/i
    ],
    exclude: null
  },
  {
    type: 'phone',
    patterns: [
      /^(电话|phone|手机|mobile|联系电话)$/i,
      /电话|phone|手机|mobile|联系/i
    ],
    exclude: null
  },
  {
    type: 'bankName',
    patterns: [
      /^(开户行|开户银行|银行名称|开户行信息|bank\s*name)$/i,
      /开户行|开户银行|银行名称|bank\s*name/i
    ],
    exclude: null
  },
  {
    type: 'bankCard',
    patterns: [
      /^(银行卡号?|bank|卡号|bankcard|账号|账户)$/i,
      /银行|bank|卡号|bankcard|账号|开户|账户/i
    ],
    exclude: null
  },
  {
    type: 'note',
    patterns: [
      /^(备注|note|说明|remark|类型|方式|承担|服务费|税源地|业务类型)$/i,
      /备注|note|说明|remark|类型|方式|承担|服务费|税源地|业务/i
    ],
    exclude: null
  }
];

const COL_TYPE_LABELS = {
  '':        '— 不识别 —',
  name:      ' 姓名',
  month:     '月份',
  amount:    ' 金额',
  socialBase:     ' 社保基数',
  fundBase:       ' 公积金基数',
  fundRate:       ' 公积金比例',
  bonus:          ' 年终奖',
  extraDeduction: ' 专项附加扣除',
  city:           ' 城市',
  idCard:    ' 身份证',
  phone:     ' 电话',
  bankName:  ' 开户银行',
  bankCard:  ' 银行卡',
  note:      ' 备注',
};

/**
 * 计算某个表头匹配某个类型的得分
 */
function getColumnMatchScore(header, config) {
  const v = String(header || '').trim();
  if (!v) return 0;
  
  // 检查是否在排除列表中
  if (config.exclude && config.exclude.test(v)) return -1;
  
  // 按模式优先级匹配，得分依次递减
  for (let i = 0; i < config.patterns.length; i++) {
    if (config.patterns[i].test(v)) {
      return config.patterns.length - i;  // 前面的模式得分更高
    }
  }
  return 0;
}

/**
 * 强身份标识：行内出现身份证号 / 手机号 / 银行卡号 / 统一信用代码格式的值，
 * 说明该行一定是人员数据行，绝不能当作表头或垃圾行过滤掉。
 * （旧逻辑用"关键词命中数>=2"判断表头行，导致"身份证/银行卡/XX银行"等
 *   数据单元格值被误判，整表数据被清空，只剩银行名不含关键词的极少数行。）
 */
function rowHasStrongIdentity(row) {
  return (row || []).some(cell => {
    const s = String(cell || '').trim();
    if (!s) return false;
    if (/^\d{17}[\dXx]$/.test(s)) return true;                    // 身份证号
    if (/^1[3-9]\d{9}$/.test(s)) return true;                     // 手机号
    if (/^\d{16,19}$/.test(s)) return true;                       // 银行卡号
    if (/^[0-9A-Za-z]{18}$/.test(s) && /[A-Za-z]/.test(s)) return true; // 统一信用代码
    return false;
  });
}

/**
 * 检测下一行是否是表头延续（双行表头的第二行）
 */
function isHeaderContinuation(headerRow, nextRow) {
  if (!nextRow || !Array.isArray(nextRow)) return false;
  const nextNonEmpty = nextRow.filter(c => c != null && String(c).trim() !== '');
  if (nextNonEmpty.length === 0) return false;
  // 双行表头的第二行通常只有少数拆分的列，不超过表头列数的一半
  if (nextNonEmpty.length > Math.max(3, headerRow.length * 0.5)) return false;
  // 所有非空单元格必须是短文本，不能是数字、身份证号、手机号、银行卡号等数据值
  for (const c of nextNonEmpty) {
    const s = String(c).trim();
    if (!s) continue;
    if (/^\d+(\.\d+)?$/.test(s)) return false;       // 纯数字
    if (/^\d{17}[\dXx]$/.test(s)) return false;       // 身份证号
    if (/^1[3-9]\d{9}$/.test(s)) return false;        // 手机号
    if (/^\d{16,19}$/.test(s)) return false;          // 银行卡号
    if (s.length > 10) return false;                  // 表头文本通常较短
  }
  return true;
}

/**
 * 合并双行表头：对于每一列，若两行都有值则拼接，否则取非空值
 */
function mergeHeaderRows(row1, row2) {
  const len = Math.max(row1.length, row2.length);
  const merged = [];
  for (let i = 0; i < len; i++) {
    const h1 = String(row1[i] || '').trim();
    const h2 = String(row2[i] || '').trim();
    if (h1 && h2) merged.push(h1 + h2);
    else merged.push(h1 || h2);
  }
  return merged;
}

/**
 * 智能探测数据表：扫描前25行找到关键词最密集的行作为表头
 */
function smartDetectTable(rows) {
  const SUMMARY_RE = /合计|总计|汇总|小计|total|sum/i;
  const HEADER_RE = /月份|month|时间|日期|date|收入|income|金额|amount|姓名|name|身份证|电话|phone|手机|银行|bank|卡号/i;
  let bestIdx = 0, bestScore = 0;
  const scanEnd = Math.min(rows.length, 25);

  for (let i = 0; i < scanEnd; i++) {
    const row = rows[i] || [];
    let score = 0;
    row.forEach(cell => {
      const v = String(cell || '');
      if (!v.trim()) return;
      // 检查是否匹配任何列识别关键词
      for (const config of COL_KEYWORDS) {
        if (getColumnMatchScore(v, config) > 0) {
          score++;
          break;
        }
      }
      if (/序号|编号|^#$/.test(v)) score += 0.5;
    });
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }

  let headerRow = rows[bestIdx] || [];
  let dataStartIdx = bestIdx + 1;
  // 双行表头：下一行是表头延续（少量短文本拆分列）时，合并为完整表头
  if (isHeaderContinuation(headerRow, rows[dataStartIdx])) {
    headerRow = mergeHeaderRows(headerRow, rows[dataStartIdx]);
    dataStartIdx++;
  }

  const dataRows = [];
  for (let i = dataStartIdx; i < rows.length; i++) {
    const row = rows[i] || [];
    const firstCell = String(row[0] || '') + String(row[1] || '');
    if (SUMMARY_RE.test(firstCell)) continue;
    if (isSummaryLikeRow(row)) continue;
    const nonEmptyCells = row.filter(c => c != null && String(c).trim() !== '');
    if (nonEmptyCells.length === 0) continue;
    // 含身份证号/手机号/银行卡号等强身份标识 → 一定是数据行，直接保留
    if (rowHasStrongIdentity(row)) { dataRows.push(row); continue; }
    // 次级表头行：非空单元格大多是短文本表头关键词（至少3个且占60%以上）才跳过。
    // 不能再用"命中数>=2"这种宽松条件——数据行的"XX银行""身份证"等值也会命中。
    const kwCells = row.filter(cell => {
      const s = String(cell || '').trim();
      return s && HEADER_RE.test(s) && s.length <= 8;
    });
    if (kwCells.length >= 3 && kwCells.length >= nonEmptyCells.length * 0.6) continue;
    dataRows.push(row);
  }
  return { headerRow, headerRowIndex: bestIdx, dataRows };
}

/**
 * 自动推断列映射 + 构建映射UI数据
 */
function detectColumnMapping(headerRow, dataRows) {
  const mapping = {};
  const used = new Set();
  const typeScores = {}; // 记录每个类型在各列中的得分

  // 第一阶段：为每一列计算每个类型的匹配得分
  headerRow.forEach((cell, i) => {
    const v = String(cell || '').trim();
    if (!v) return;
    
    typeScores[i] = {};
    for (const config of COL_KEYWORDS) {
      typeScores[i][config.type] = getColumnMatchScore(v, config);
    }
  });

  // 第二阶段：按类型逐个选择最佳匹配列（排除金额列先不处理）
  for (const config of COL_KEYWORDS) {
    const type = config.type;
    if (type === 'amount' || used.has(type)) continue;
    
    let bestCol = null;
    let bestScore = 0;
    
    for (let i = 0; i < headerRow.length; i++) {
      if (mapping[i]) continue; // 列已被占用
      const score = typeScores[i]?.[type] || 0;
      if (score > bestScore) {
        bestScore = score;
        bestCol = i;
      }
    }
    
    if (bestCol != null && bestScore > 0) {
      mapping[bestCol] = type;
      used.add(type);
    }
  }

  // 金额列优先按表头 + 数值样本双重判定，避免把“发放方式”等列误识别成金额
  let bestAmountIdx = null;
  let bestAmountScore = -Infinity;
  headerRow.forEach((cell, i) => {
    if (mapping[i]) return;
    const score = getAmountColumnScore(cell, dataRows, i);
    if (score > bestAmountScore) {
      bestAmountScore = score;
      bestAmountIdx = i;
    }
  });
  if (bestAmountIdx != null && bestAmountScore >= 5) {
    mapping[bestAmountIdx] = 'amount';
    used.add('amount');
  }

  // 如果没识别到金额列，扫描数据找纯数值列
  if (!used.has('amount')) {
    for (let ci = 0; ci < headerRow.length; ci++) {
      if (mapping[ci]) continue;
      let numCount = 0;
      for (let ri = 0; ri < Math.min(dataRows.length, 10); ri++) {
        if (isAmountLikeNumber(dataRows[ri]?.[ci])) numCount++;
      }
      if (numCount >= Math.min(dataRows.length, 10) * 0.5) {
        mapping[ci] = 'amount';
        used.add('amount');
        break;
      }
    }
  }

  const cols = {};
  headerRow.forEach((cell, i) => {
    const v = String(cell || '').trim();
    if (!v && mapping[i] == null) return;
    const samples = [];
    for (let ri = 0; ri < Math.min(dataRows.length, 3); ri++) {
      const sv = dataRows[ri]?.[i];
      if (sv != null && String(sv).trim()) samples.push(String(sv).trim());
    }
    cols[i] = { header: v || `列${i+1}`, type: mapping[i] || '', samples };
  });

  return { cols, amountType: 'preTax' };
}

/**
 * 显示列映射确认UI
 */
function showColumnMappingUI(rawRows, headerRow, headerRowIndex, dataRows, filename, sourceItems = [], selectedRows = rawRows) {
  const container = document.getElementById('batch-preview');
  const resultBox = document.getElementById('batch-result');
  resultBox.style.display = 'none';
  container.style.display = '';

  const autoMap = detectColumnMapping(headerRow, dataRows);
  window._colMappingState = { rawRows, headerRow, headerRowIndex, dataRows, filename, mapping: autoMap, sourceItems, selectedRows };

  // 统计
  const totalDataRows = dataRows.length;
  const sampleCount = Math.min(dataRows.length, 5);
  const skippedRows = headerRowIndex;

  // 构建列映射卡片
  let colsHTML = '';
  const colIndices = Object.keys(autoMap.cols).map(Number).sort((a, b) => a - b);
  colIndices.forEach(ci => {
    const col = autoMap.cols[ci];
    const isSelected = col.type !== '';
    colsHTML += `
      <div class="mapping-col ${isSelected ? 'selected' : ''}">
        <div class="col-idx">第 ${ci + 1} 列</div>
        <div class="col-header">${col.header}</div>
        <select data-col="${ci}" onchange="PageBatch.onMappingChange(this)">
          ${Object.entries(COL_TYPE_LABELS).map(([k, v]) =>
            `<option value="${k}" ${k === col.type ? 'selected' : ''}>${v}</option>`
          ).join('')}
        </select>
        <div class="col-sample">${col.samples.map(s => `<span>${s.length > 15 ? s.slice(0,15)+'…' : s}</span>`).join(' ')}</div>
      </div>`;
  });

  // 构建原始数据预览
  let previewRowsHTML = '';
  for (let ri = 0; ri < sampleCount; ri++) {
    const row = dataRows[ri] || [];
    previewRowsHTML += '<tr>';
    colIndices.forEach(ci => {
      const v = String(row[ci] || '');
      previewRowsHTML += `<td style="font-size:12px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${v || '<span style="color:var(--t-text-2);opacity:0.4;">—</span>'}</td>`;
    });
    previewRowsHTML += '</tr>';
  }
  if (dataRows.length > sampleCount) {
    previewRowsHTML += `<tr><td colspan="${colIndices.length}" style="text-align:center;color:var(--t-text-2);font-size:12px;padding:8px;">… 还有 ${dataRows.length - sampleCount} 行</td></tr>`;
  }

  let previewHeadHTML = '';
  colIndices.forEach(ci => {
    previewHeadHTML += `<th style="font-size:11px;white-space:nowrap;">${autoMap.cols[ci].header}</th>`;
  });

  const sourceHTML = renderSourceSelectionHTML(sourceItems);

  container.innerHTML = `
    <div class="card" style="border-color:var(--t-primary);border-width:1px;">
      <div class="card-title">
        <span style="display:flex;align-items:center;gap:8px;">
          <span class="icon">${UI.icon("eye")}</span>
          智能识别 — ${filename}
        </span>
        <span class="badge">自动检测</span>
      </div>

      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
        <div style="background:var(--t-bg-header);padding:8px 14px;border-radius:8px;font-size:13px;">
           发现 <strong style="color:var(--t-primary);">${totalDataRows}</strong> 行数据
        </div>
        <div style="background:var(--t-bg-header);padding:8px 14px;border-radius:8px;font-size:13px;">
           识别到 <strong style="color:var(--t-primary);">${colIndices.length}</strong> 列
        </div>
        ${skippedRows > 0 ? `<div style="background:var(--t-bg-header);padding:8px 14px;border-radius:8px;font-size:13px;">⏭ 跳过前 ${skippedRows} 行头部信息</div>` : ''}
      </div>

      ${sourceHTML}

      <div style="font-size:14px;font-weight:600;margin-bottom:12px;color:var(--t-text);"> 列映射 — 请确认或修改每列的用途</div>
      <div class="mapping-grid">${colsHTML}</div>

      <div style="background:var(--t-bg-header);border-radius:8px;padding:16px;border:1px solid var(--t-border);margin-bottom:16px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:10px;color:var(--t-text);"> 金额类型</div>
        <div style="display:flex;gap:16px;">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--t-text);">
            <input type="radio" name="amount-type" value="preTax" checked style="accent-color:var(--t-primary);"> ${incomeType === 'salary' ? '应发工资（将用累计预扣法计算个税）' : '税前收入（将用累计预扣法计算个税）'}
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--t-text);">
            <input type="radio" name="amount-type" value="postTax" style="accent-color:var(--t-primary);"> ${incomeType === 'salary' ? '实发工资（将反算应发工资）' : '税后收入（将反算税前金额）'}
          </label>
        </div>
      </div>

      <div style="margin-bottom:12px;">
        <div style="font-size:13px;font-weight:600;color:var(--t-text-2);margin-bottom:8px;"> 原始数据预览（前 ${sampleCount} 行）</div>
        <div style="overflow-x:auto;border:1px solid var(--t-border);border-radius:8px;">
          <table class="result-table" style="font-size:12px;">
            <thead><tr>${previewHeadHTML}</tr></thead>
            <tbody>${previewRowsHTML}</tbody>
          </table>
        </div>
      </div>

      <div style="display:flex;gap:12px;">
        <button class="btn btn-primary" style="flex:1;padding:12px;font-size:15px;" onclick="PageBatch.confirmColumnMapping()"> 确认映射并计算</button>
        <button class="btn btn-secondary" style="padding:12px;" onclick="PageBatch.resetBatch()"> 重新上传</button>
      </div>
    </div>
  `;
}

function renderSourceSelectionHTML(sourceItems) {
  if (!sourceItems || sourceItems.length <= 1) return '';

  const selectedCount = sourceItems.filter(item => item.selected).length;
  const rowsCount = sourceItems.filter(item => item.selected).reduce((sum, item) => sum + item.rows.length, 0);
  const cards = sourceItems.map(item => {
    const analysis = item.analysis || {};
    const score = typeof analysis.score === 'number' ? Math.max(0, Math.round(analysis.score)) : null;
    const monthHint = analysis.monthHint ? ` · 月份提示 ${analysis.monthHint}` : '';
    const desc = item.type === 'excel-sheet'
      ? `${item.fileName} / ${item.sheetName || 'Sheet'}`
      : item.fileName;
    const isPreview = item.id === _previewSourceId;
    const isActive = isPreview || item.selected;
    return `
      <div style="padding:12px;border:1px solid ${isActive ? 'var(--t-primary)' : 'var(--t-border)'};border-radius:8px;background:${isActive ? 'var(--t-primary-bg)' : 'var(--t-bg-header)'};">
        <div style="display:flex;gap:10px;align-items:flex-start;">
          <input type="checkbox" ${item.selected ? 'checked' : ''} onchange='toggleBatchSource(${JSON.stringify(item.id)}, this.checked)' style="margin-top:2px;accent-color:var(--t-primary);">
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:600;color:var(--t-text);word-break:break-word;">${desc}</div>
            <div style="font-size:12px;color:var(--t-text-2);margin-top:4px;">
              ${score != null ? `评分 ${score} 分 · ` : ''}${analysis.dataRowsCount || item.rows.length} 行${monthHint}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary" style="padding:6px 10px;font-size:12px;${isPreview ? 'border-color:var(--t-primary);color:var(--t-primary);' : ''}" onclick='setPreviewSource(${JSON.stringify(item.id)})'>${isPreview ? '已在预览' : '预览此表'}</button>
          <button type="button" class="btn btn-secondary" style="padding:6px 10px;font-size:12px;" onclick='selectOnlySource(${JSON.stringify(item.id)})'>仅用此表</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div style="background:var(--t-bg-header);border-radius:8px;padding:16px;border:1px solid var(--t-border);margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
        <div style="font-size:13px;font-weight:600;color:var(--t-text);"> 数据表选择</div>
        <div style="font-size:12px;color:var(--t-text-2);">已选 ${selectedCount} 个数据表，合计 ${rowsCount} 行</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;">${cards}</div>
      <div style="font-size:12px;color:var(--t-text-2);margin-top:10px;">系统会优先勾选最像明细数据的 Sheet；如果某个页只是汇总、模板或说明，可以取消勾选。</div>
    </div>
  `;
}

function toggleBatchSource(sourceId, checked) {
  const target = _accumSources.find(item => item.id === sourceId);
  if (!target) return;
  target.selected = checked;
  if (checked) _previewSourceId = sourceId;
  if (!checked && _previewSourceId === sourceId) {
    _previewSourceId = _accumSources.find(item => item.selected && item.id !== sourceId)?.id || '';
  }
  refreshBatchPreview();
}

function setPreviewSource(sourceId) {
  const target = _accumSources.find(item => item.id === sourceId);
  if (!target) return;
  if (!target.selected) target.selected = true;
  _previewSourceId = sourceId;
  refreshBatchPreview();
}

function selectOnlySource(sourceId) {
  let matched = false;
  _accumSources.forEach(item => {
    item.selected = item.id === sourceId;
    if (item.id === sourceId) matched = true;
  });
  if (!matched) return;
  _previewSourceId = sourceId;
  refreshBatchPreview();
}

function onMappingChange(sel) {
  const state = window._colMappingState;
  if (state) state.mapping.cols[sel.dataset.col].type = sel.value;
  sel.parentElement.classList.toggle('selected', !!sel.value);
}

function confirmColumnMapping() {
  const state = window._colMappingState;
  if (!state) return;

  // 构建列映射
  const colMap = {};
  Object.entries(state.mapping.cols).forEach(([ci, col]) => {
    if (col.type) colMap[col.type] = parseInt(ci);
  });

  if (colMap.amount == null) return alert('请至少映射一个「金额」列');

  // 金额类型
  const amountTypeRadio = document.querySelector('input[name="amount-type"]:checked');
  const amountType = amountTypeRadio ? amountTypeRadio.value : 'preTax';
  batchDirection = amountType === 'postTax' ? 'reverse' : 'forward';

  // 解析并展示预览
  processWithMapping(state.selectedRows || state.dataRows, colMap, state.filename, state.sourceItems);
}

/** 人员唯一标识：有身份证优先用身份证，否则综合姓名/电话/银行卡 */
function buildPersonKey({ name, idCard, phone, bankCard }) {
  if (idCard) return 'ID:' + idCard;
  const parts = [];
  if (name && name !== '默认') parts.push('N:' + name);
  if (phone) parts.push('P:' + phone);
  if (bankCard) parts.push('B:' + bankCard);
  return parts.length > 0 ? parts.join('|') : '默认';
}

/** 按 personKey 分组并合并身份信息（取最长非空值），返回 { personKeys, personsMap } */
function groupPersons(parsed) {
  const personsMap = {};
  parsed.forEach(d => {
    if (!personsMap[d.personKey]) {
      personsMap[d.personKey] = { name: d.person, idCard: d.idCard, phone: d.phone, bankCard: d.bankCard, records: [] };
    }
    const g = personsMap[d.personKey];
    if (d.idCard && d.idCard.length > g.idCard.length) g.idCard = d.idCard;
    if (d.phone && d.phone.length > g.phone.length) g.phone = d.phone;
    if (d.bankCard && d.bankCard.length > g.bankCard.length) g.bankCard = d.bankCard;
    if (d.person && d.person !== '默认' && (!g.name || g.name === '默认')) g.name = d.person;
    g.records.push(d);
  });
  const personKeys = Object.keys(personsMap).sort((a, b) => {
    const na = personsMap[a].name || a;
    const nb = personsMap[b].name || b;
    return na.localeCompare(nb);
  });
  return { personKeys, personsMap };
}

/**
 * 用确认的列映射解析数据 → 展示预览
 */
function processWithMapping(dataRows, colMap, filename, sourceItems = []) {
  window._batchParsed = null;
  window._batchFilename = null;
  window._batchResults = null;
  document.getElementById('batch-result').style.display = 'none';

  const parseRowsWithMap = (rows, rowColMap) => {
    const parsedRows = [];
    rows.forEach(row => {
      if (isSummaryLikeRow(row)) return;
      let month = '', amount = 0, name = '默认', idCard = '', phone = '', bankCard = '';
      let socialBase = '', fundBase = '', fundRate = '', extraDeduction = '', bonus = '';
      let city = '';
      const monthHint = row._sheetMonthHint || '';

      // 金额类单元格：空值保留 ''（区别于显式 0），供行内值优先/全局兜底判断
      const readAmt = (ci) => {
        const v = String(row[ci] == null ? '' : row[ci]).trim();
        if (v === '') return '';
        const num = parseAmount(v);
        return isNaN(num) ? '' : num;
      };

      if (rowColMap.name != null) name = String(row[rowColMap.name] || '').trim();
      if (rowColMap.month != null) month = normalizeMonthWithHint(String(row[rowColMap.month] || ''), monthHint);
      if (rowColMap.amount != null) amount = parseAmount(String(row[rowColMap.amount] || ''));
      if (rowColMap.idCard != null) idCard = sanitizeIdCard(row[rowColMap.idCard]);
      if (rowColMap.phone != null) phone = sanitizePhone(row[rowColMap.phone]);
      if (rowColMap.bankCard != null) bankCard = sanitizeBankCard(row[rowColMap.bankCard]);
      if (rowColMap.socialBase != null) socialBase = readAmt(rowColMap.socialBase);
      if (rowColMap.fundBase != null) fundBase = readAmt(rowColMap.fundBase);
      if (rowColMap.fundRate != null) fundRate = parseFundRate(row[rowColMap.fundRate]);
      if (rowColMap.extraDeduction != null) extraDeduction = readAmt(rowColMap.extraDeduction);
      if (rowColMap.bonus != null) bonus = readAmt(rowColMap.bonus);
      if (rowColMap.city != null) city = String(row[rowColMap.city] == null ? '' : row[rowColMap.city]).trim();
      if ((!month || month === '-') && monthHint) month = monthHint;
      name = sanitizeName(name) || '默认';

      if (!month || month === '-') {
        const inferredMonth = extractMonthHintFromRows([row], extractYearHint(monthHint));
        if (inferredMonth) month = inferredMonth;
      }

      // 所有途径都未得到月份时，默认按当前年月测算（即适用当前新政策）
      if (!month || month === '-') {
        const now = new Date();
        month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      }

      const personKey = buildPersonKey({ name, idCard, phone, bankCard });

      if (amount > 0 && rowHasUsableIdentity({ name, idCard, phone, bankCard })) {
        const monthRaw = rowColMap.month != null ? row[rowColMap.month] : '';
        parsedRows.push({
          month: month || '-',
          monthRaw,
          sortTime: extractSortDateTime(monthRaw),
          amount,
          socialBase,
          fundBase,
          fundRate,
          extraDeduction,
          bonus,
          city,
          person: name,
          idCard,
          phone,
          bankCard,
          personKey,
          sourceRowIndex: row._sourceRowIndex ?? 0,
          sourceSheet: row._sheetName || '',
          sourceFile: row._fileName || ''
        });
      }
    });
    return parsedRows;
  };

  const preferredTypes = Object.keys(colMap);
  const buildLocalColMap = (headerRow, localDataRows) => {
    const detected = detectColumnMapping(headerRow, localDataRows);
    const localColMap = {};
    const byType = {};
    Object.entries(detected.cols || {}).forEach(([ci, col]) => {
      if (col.type && byType[col.type] == null) byType[col.type] = Number(ci);
    });

    preferredTypes.forEach(type => {
      if (byType[type] != null) {
        localColMap[type] = byType[type];
      } else if (colMap[type] != null && headerRow[colMap[type]] != null) {
        localColMap[type] = colMap[type];
      }
    });
    return localColMap;
  };

  const selectedSources = (sourceItems || []).filter(item => item.selected);
  let parsed = [];

  if (selectedSources.length > 0) {
    selectedSources.forEach(source => {
      const taggedRows = tagSourceRows(source);
      const { headerRow, dataRows: sourceDataRows } = smartDetectTable(taggedRows);
      const localColMap = source.id === _previewSourceId
        ? { ...colMap }
        : buildLocalColMap(headerRow, sourceDataRows);

      if (localColMap.amount != null) {
        parsed.push(...parseRowsWithMap(sourceDataRows, localColMap));
      }
    });
  } else {
    parsed = parseRowsWithMap(dataRows, colMap);
  }

  const { personKeys, personsMap } = groupPersons(parsed);

  window._batchParsed = { parsed, personKeys, personsMap, sourceItems };
  window._batchFilename = filename;
  showBatchPreview(parsed, personKeys, personsMap, filename);
}

/**
 * 预览导入数据（不计算）
 */
function showBatchPreview(parsed, personKeys, personsMap, filename) {
  const container = document.getElementById('batch-preview');
  const resultBox = document.getElementById('batch-result');
  resultBox.style.display = 'none'; // 隐藏旧结果
  container.style.display = '';

  // 统计信息
  const totalRows = parsed.length;
  const totalAmount = parsed.reduce((s, d) => s + d.amount, 0);
  const months = [...new Set(parsed.map(d => d.month).filter(m => m !== '-'))].sort();
  const monthRange = months.length > 0
    ? `${months[0]} ~ ${months[months.length - 1]}`
    : '未识别月份';

  // 检测哪些身份列有数据
  const { hasIdCard, hasPhone, hasBankCard } = identityFlagsOf(parsed);

  // 按人统计
  const personStats = personKeys.map(key => {
    const g = personsMap[key];
    const sum = g.records.reduce((s, d) => s + d.amount, 0);
    return { name: g.name, idCard: g.idCard, phone: g.phone, bankCard: g.bankCard, count: g.records.length, sum };
  });

  // 构建预览表头
  let previewHeadCols = '<th style="width:40px">#</th><th class="label-col">姓名</th>';
  if (hasIdCard) previewHeadCols += '<th>身份证号</th>';
  if (hasPhone) previewHeadCols += '<th>电话</th>';
  if (hasBankCard) previewHeadCols += '<th>银行卡号</th>';
  previewHeadCols += '<th>月份</th><th>金额</th>';

  container.innerHTML = `
    <div class="card" style="border-color:var(--t-primary);border-width:1px;">
      <div class="card-title"><span style="display:flex;align-items:center;gap:8px;"><span class="icon">${UI.icon("table")}</span> 数据预览 — ${filename}</span></div>

      <div class="summary-grid" style="margin-bottom:20px;">
        <div class="summary-item">
          <div class="label">总记录数</div>
        <div class="value blue">${totalRows}</div>
        </div>
        <div class="summary-item">
          <div class="label">涉及人数</div>
          <div class="value blue">${personKeys.length}</div>
        </div>
        <div class="summary-item">
          <div class="label">金额合计</div>
          <div class="value orange">¥${formatNum(totalAmount)}</div>
        </div>
        <div class="summary-item">
          <div class="label">月份范围</div>
          <div class="value" style="font-size:14px;color:var(--t-text);">${monthRange}</div>
        </div>
      </div>

      <!-- 分批上传提示 -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;padding:12px 16px;background:var(--t-bg-header);border-radius:8px;border:1px solid var(--t-border);">
        <span style="font-size:14px;color:var(--t-text);flex:1;"> 已加载 <strong style="color:var(--t-primary);">${_accumFileCount}</strong> 个文件，共 <strong style="color:var(--t-primary);">${totalRows}</strong> 条记录</span>
        <label class="btn btn-secondary" style="padding:6px 14px;font-size:12px;margin:0;cursor:pointer;">
           继续上传
          <input type="file" accept=".csv,.xlsx,.xls" multiple onchange="PageBatch.handleFile(event)" style="display:none;">
        </label>
        <button class="btn btn-secondary" style="padding:6px 14px;font-size:12px;" onclick="PageBatch.resetBatch()"> 重置全部</button>
      </div>

      <!-- 人员汇总 + 数据预览（合并为紧凑区块） -->
      <div style="margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-size:13px;font-weight:600;color:var(--t-text-2);"> 人员汇总（${personKeys.length} 人）</div>
          ${personKeys.length > 15 ? `<button class="btn btn-secondary" style="padding:4px 10px;font-size:11px;" onclick="PageBatch.togglePersonTable(this)">展开全部</button>` : ''}
        </div>
        <div style="overflow-x:auto;border:1px solid var(--t-border);border-radius:8px;">
          <table class="result-table" style="font-size:13px;">
            <thead>
              <tr>
                <th style="width:40px">#</th>
                <th class="label-col">姓名</th>
                ${hasIdCard ? '<th>身份证号</th>' : ''}
                <th>记录数</th>
                <th>金额合计</th>
              </tr>
            </thead>
            <tbody>
              ${personStats.map((p, i) => {
                const isHidden = i >= 15 ? ' class="person-extra" style="display:none;"' : '';
                let idCol = hasIdCard ? `<td style="font-size:12px;color:var(--t-text-2);">${p.idCard ? p.idCard.slice(0,6)+'****'+p.idCard.slice(-4) : '-'}</td>` : '';
                return `<tr${isHidden}>
                  <td>${i + 1}</td>
                  <td class="label-col">${p.name}</td>
                  ${idCol}
                  <td>${p.count}</td>
                  <td style="font-weight:600;color:var(--t-primary);">¥${formatNum(p.sum)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 数据预览表 -->
      <div style="margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-size:13px;font-weight:600;color:var(--t-text-2);"> 数据明细（${parsed.length} 条）</div>
          ${parsed.length > 10 ? `<button class="btn btn-secondary" style="padding:4px 10px;font-size:11px;" onclick="PageBatch.togglePreviewTable(this)">展开全部</button>` : ''}
        </div>
        <div style="overflow-x:auto;border:1px solid var(--t-border);border-radius:8px;">
          <table class="result-table" style="font-size:13px;">
            <thead><tr>${previewHeadCols}</tr></thead>
            <tbody>
              ${parsed.map((d, i) => {
                const isHidden = i >= 10 ? ' class="preview-extra" style="display:none;"' : '';
                let cols = `<td>${i + 1}</td><td class="label-col">${d.person}</td>`;
                if (hasIdCard) cols += `<td style="font-size:12px;color:var(--t-text-2);">${d.idCard || '-'}</td>`;
                if (hasPhone) cols += `<td style="font-size:12px;color:var(--t-text-2);">${d.phone ? d.phone.slice(0,3)+'****'+d.phone.slice(-4) : '-'}</td>`;
                if (hasBankCard) cols += `<td style="font-size:12px;color:var(--t-text-2);">${d.bankCard ? '****'+d.bankCard.slice(-4) : '-'}</td>`;
                cols += `<td>${d.month}</td><td>¥${formatNum(d.amount)}</td>`;
                return `<tr${isHidden}>${cols}</tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 选择方向并计算 -->
      <div style="background:var(--t-bg-header);border-radius:8px;padding:20px;border:1px solid var(--t-border);">
        <div style="font-size:14px;font-weight:600;margin-bottom:14px;color:var(--t-text);"> 选择计算方式${incomeType === 'salary' ? '（工资薪金 · 累计预扣）' : ''}</div>
        <div class="direction-toggle" style="margin-bottom:16px;">
          <button class="direction-btn active" data-dir="forward" data-target="batch">${incomeType === 'salary' ? '应发 → 实发' : '税前 → 税后'}</button>
          <button class="direction-btn" data-dir="reverse" data-target="batch">${incomeType === 'salary' ? '实发 → 应发' : '税后 → 税前'}</button>
        </div>
        ${incomeType === 'labor' ? `
        <div class="toggle-row" style="margin-bottom:16px;">
          <div>
            <div class="toggle-label"> 断月重置</div>
            <div class="toggle-hint">开启后，同一人相邻月份中断超过1个月，累计自动归零重新起算</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" checked onclick="TaxState.batchGapReset=this.checked;">
            <span class="slider"></span>
          </label>
        </div>` : `
        <div style="font-size:12px;color:var(--t-text-2);margin-bottom:16px;">三险一金按行内城市/整批城市政策自动计算：行内基数（按城市上下限 clamp）&gt; 整批设置/全局基数 &gt; 应发工资作基数（勾选后）；公积金比例按 行内「公积金比例」列 &gt; 「工资参数」档位；均无基数则记 0 并标注。整批城市与「按应发工资作基数」在上方「全局兜底设置」中配置。</div>`}
        <button class="btn btn-primary" onclick="PageBatch.runBatchCalc()" style="width:100%;padding:12px;font-size:15px;"> 开始计算</button>
      </div>
    </div>
  `;

  // 重新绑定方向按钮事件
  container.querySelectorAll('.direction-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const dir = btn.dataset.dir;
      btn.parentElement.querySelectorAll('.direction-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      batchDirection = dir;
    });
  });
}

/* ==================== 批量·工资薪金单人计税流水线 ==================== */

/** 年终奖合成记录：金额取「年终奖」列，不参与三险一金与专项附加 */
function makeBatchBonusSynthRec(b) {
  return {
    ...b,
    amount: round2(Number(b.bonus) || 0),
    socialBase: '', fundBase: '', fundRate: '', extraDeduction: '',
    _isBonus: true
  };
}

/**
 * 单人工资薪金计税流水线（可重复执行以支持年终奖方案对比）
 * @param {object} group 人员分组
 * @param {Array} records 工资记录（月份升序）
 * @param {Array} bonusRecs 需「并入综合所得」的年终奖记录（作为收入插入发放月）
 */
function runBatchSalaryPass(group, records, bonusRecs) {
  const rows = [];

  /* 年终奖合成记录：排在发放月最后一笔工资之后；当月无工资记录时插到月序合适处 */
  let merged;
  if (bonusRecs && bonusRecs.length) {
    merged = [];
    for (let i = 0; i < records.length; i++) {
      merged.push(records[i]);
      const next = records[i + 1];
      if (!next || next.month !== records[i].month) {
        bonusRecs.filter(b => b.month === records[i].month)
          .forEach(b => merged.push(makeBatchBonusSynthRec(b)));
      }
    }
    bonusRecs.filter(b => !records.some(r => r.month === b.month)).forEach(b => {
      let idx = 0;
      merged.forEach((r, i) => { if (!r._isBonus && (r.month || '') <= b.month) idx = i + 1; });
      merged.splice(idx, 0, makeBatchBonusSynthRec(b));
    });
  } else {
    merged = records.slice();
  }

  let cumIncome = 0, cumTax = 0, cumDeduction = 0;
  let cumSI = 0, cumExtra = 0;
  let lastMonth = '', lastYear = '';

  merged.forEach(d => {
    const curYear = d.month && d.month !== '-' ? d.month.split('-')[0] : '';
    if (curYear && curYear !== lastYear) {
      if (lastYear !== '') {
        cumIncome = 0;
        cumTax = 0;
        cumDeduction = 0;
        lastMonth = '';
      }
      lastYear = curYear;
    }

    /* 城市适用链：行内城市 > 整批城市 > 工资参数城市；未知城市回退并标注 */
    const rowCityKey = d.city ? findCityKey(d.city) : null;
    const cityUnknown = !!d.city && !rowCityKey;
    const cityKey = rowCityKey || batchCityId || salaryParams.cityId;
    const pol = resolvePolicyMemo(cityKey, d.month);
    /* 公积金比例：行内「公积金比例」列 > 「工资参数」全局档位 */
    const effFundRate = (d.fundRate !== '' && d.fundRate != null) ? Number(d.fundRate) : salaryParams.fundRate;

    /* 三险一金：年终奖行不缴社保；工资行按 行内基数×城市政策 > 全局基数 > 按应发工资作基数（勾选时）> 0 并标注 */
    let si;
    let siD = null;
    if (d._isBonus) {
      si = 0;
    } else {
      const hasRowBase = d.socialBase !== '' && d.socialBase != null && d.socialBase > 0;
      if (hasRowBase) {
        const fund = (d.fundBase !== '' && d.fundBase != null) ? d.fundBase : d.socialBase;
        siD = computeSocialInsuranceDetail(d.socialBase, fund, pol.items, effFundRate);
        si = siD.total;
      } else if (salaryParams.socialBase > 0) {
        siD = computeSocialInsuranceDetail(salaryParams.socialBase, salaryParams.fundBase, pol.items, effFundRate);
        si = siD.total;
      } else if (batchGrossAsBase) {
        siD = computeSocialInsuranceDetail(d.amount, '', pol.items, effFundRate);
        si = siD.total;
      } else {
        si = 0;
      }
    }
    si = round2(Math.max(0, Number(si) || 0));
    const siMissing = !d._isBonus && !siD;

    /* 专项附加：行内总额优先 > 全局分项明细（按月，含职业资格取证月）> 全局单一总额 */
    const extra = d._isBonus ? 0
      : ((d.extraDeduction !== '' && d.extraDeduction != null)
        ? Math.max(0, Number(d.extraDeduction) || 0)
        : getExtraDeductionFor(d.month).total);

    /* 同月多笔合并：减除费用与三险一金同月只计一次；无月份的记录各自独立起算。
       实发口径下，当月三险一金只从首笔记录中扣减，后续记录不再重复扣。 */
    const hasMonth = d.month && d.month !== '-';
    const isFirstOfMonth = !hasMonth || d.month !== lastMonth;
    if (isFirstOfMonth) {
      lastMonth = d.month || '';
      cumDeduction += 5000 + si + extra;
      if (!d._isBonus) {
        cumSI = round2(cumSI + si);
        cumExtra = round2(cumExtra + extra);
      }
    }

    const salaryCtx = { socialInsurance: isFirstOfMonth ? si : 0, extraDeduction: isFirstOfMonth ? extra : 0 };
    const r = calcTaxByDirection(batchDirection, d.amount, cumIncome, cumDeduction, cumTax, TAX_STRATEGIES.salary, salaryCtx);
    cumIncome = r.cumIncome;
    cumTax = r.cumTaxDue;

    rows.push({
      person: group.name,
      idCard: d.idCard || group.idCard,
      phone: d.phone || group.phone,
      bankCard: d.bankCard || group.bankCard,
      ...d,
      ...r,
      _isGap: false,
      _isOldPolicy: false,
      _isBonus: !!d._isBonus,
      _bonusSeparate: false,
      _bonusStrategy: d._isBonus ? 'combined' : '',
      _siMissing: siMissing,
      _cityUnknown: cityUnknown,
      _yearFallback: !pol.matched,
      _siDetail: siD,
      _cityKey: cityKey,
      _cumSI: cumSI,
      _cumExtra: cumExtra,
      cityName: CITY_POLICY_LIBRARY[cityKey].name + (cityUnknown ? `（未识别:${d.city}）` : ''),
      policyYearLabel: pol.label + (!pol.matched ? '（年度未匹配）' : '')
    });
  });

  return rows;
}

/** 批量·年终奖单独计税行：不进入累计链，独立按 ÷12 档计税 */
function makeBatchBonusSeparateRow(group, b, rows) {
  const amt = round2(Number(b.bonus) || 0);
  const tax = calcBonusTaxSeparate(amt);
  const bkt = getMonthlyBracket(amt);
  const rowCityKey = b.city ? findCityKey(b.city) : null;
  const cityUnknown = !!b.city && !rowCityKey;
  const cityKey = rowCityKey || batchCityId || salaryParams.cityId;
  const pol = resolvePolicyMemo(cityKey, b.month);
  let cumIncome = 0, cumDeduction = 0;
  rows.forEach(r => { if ((r.month || '') <= b.month) { cumIncome = r.cumIncome; cumDeduction = r.cumDeduction; } });
  return {
    person: group.name,
    idCard: b.idCard || group.idCard,
    phone: b.phone || group.phone,
    bankCard: b.bankCard || group.bankCard,
    ...b,
    amount: amt,
    preTax: amt,
    withholdingIncome: 0,
    cumIncome: cumIncome,
    cumDeduction: cumDeduction,
    taxableIncome: 0,
    rate: bkt.rate,
    quick: bkt.quick,
    cumTaxDue: tax,
    currentTax: tax,
    postTax: round2(amt - tax),
    _isGap: false,
    _isOldPolicy: false,
    _isBonus: true,
    _bonusSeparate: true,
    _bonusStrategy: 'separate',
    _siMissing: false,
    _cityUnknown: cityUnknown,
    _yearFallback: !pol.matched,
    _siDetail: null,
    _cityKey: cityKey,
    cityName: CITY_POLICY_LIBRARY[cityKey].name + (cityUnknown ? `（未识别:${b.city}）` : ''),
    policyYearLabel: pol.label + (!pol.matched ? '（年度未匹配）' : '')
  };
}

/** 批量·单人工资薪金入口：有年终奖时按「人 × 年」对比单独计税 vs 并入综合所得并择优；
 *  反算方向下并入对比不适用，年终奖一律单独计税独立成行。
 */
function runBatchSalaryPerson(group, records) {
  const bonusRecs = records.filter(r => (Number(r.bonus) || 0) > 0);
  if (!bonusRecs.length) {
    return runBatchSalaryPass(group, records, []);
  }
  if (batchDirection === 'reverse') {
    const rows = runBatchSalaryPass(group, records, []);
    bonusRecs.forEach(b => insertBonusRowSorted(rows, makeBatchBonusSeparateRow(group, b, rows)));
    return rows;
  }
  /* 正算方向：按年对比两方案（跨年累计互不影响，按年分别择优） */
  const baseRows = runBatchSalaryPass(group, records, []);
  const combRows = runBatchSalaryPass(group, records, bonusRecs);
  const yearTaxOf = (arr) => {
    const m = {};
    arr.forEach(r => {
      const y = (r.month || '').split('-')[0] || '-';
      m[y] = round2((m[y] || 0) + r.currentTax);
    });
    return m;
  };
  const baseY = yearTaxOf(baseRows);
  const combY = yearTaxOf(combRows);
  const sepY = {};
  bonusRecs.forEach(b => {
    const y = (b.month || '').split('-')[0] || '-';
    sepY[y] = round2((sepY[y] || 0) + calcBonusTaxSeparate(Number(b.bonus) || 0));
  });
  const planByYear = {};
  Object.keys(sepY).forEach(y => {
    const sepTotal = round2((baseY[y] || 0) + sepY[y]);
    const combTotal = combY[y] || 0;
    planByYear[y] = {
      strategy: sepTotal <= combTotal ? 'separate' : 'combined',
      saving: round2(Math.abs(sepTotal - combTotal))
    };
  });
  bonusRecs.forEach(b => {
    b._plan = planByYear[(b.month || '').split('-')[0] || '-'];
  });

  const combinedRecs = bonusRecs.filter(b => b._plan && b._plan.strategy === 'combined');
  const rows = combinedRecs.length ? runBatchSalaryPass(group, records, combinedRecs) : baseRows;
  bonusRecs.filter(b => b._plan && b._plan.strategy === 'separate')
    .forEach(b => insertBonusRowSorted(rows, makeBatchBonusSeparateRow(group, b, rows)));
  return rows;
}

/**
 * 执行批量计算（从预览区点击按钮触发）
 */
function runBatchCalc() {
  const data = window._batchParsed;
  if (!data) return alert('请先上传文件');

  const { parsed, personKeys, personsMap } = data;
  const filename = window._batchFilename || '批量数据';

  // 检测哪些身份列有数据
  const identityFlags = identityFlagsOf(parsed);

  /* 逐笔计税，根据月份判断政策类型 */
  const allResults = [];
  const compareBatchRecordOrder = (a, b) => {
    const monthCmp = compareMonth(a.month, b.month);
    if (monthCmp !== 0) return monthCmp;

    const ta = a.sortTime || '';
    const tb = b.sortTime || '';
    if (ta && tb && ta !== tb) return ta.localeCompare(tb);
    if (ta && !tb) return -1;
    if (!ta && tb) return 1;

    const ia = Number.isFinite(a.sourceRowIndex) ? a.sourceRowIndex : 0;
    const ib = Number.isFinite(b.sourceRowIndex) ? b.sourceRowIndex : 0;
    return ia - ib;
  };

  personKeys.forEach(key => {
    const group = personsMap[key];
    const records = group.records.slice().sort(compareBatchRecordOrder);

    if (incomeType === 'salary') {
      allResults.push(...runBatchSalaryPerson(group, records));
      return;
    }

    let cumIncome = 0, cumTax = 0, cumDeduction = 0;
    let lastMonth = '';
    let lastYear = '';

    records.forEach(d => {
      if (isNewPolicy(d.month)) {
        // 新政策：累计预扣
        const parts = d.month.split('-');
        const curYear = parts.length >= 2 ? parts[0] : '';

        if (curYear && curYear !== lastYear) {
          if (lastYear !== '') {
            cumIncome = 0;
            cumTax = 0;
            cumDeduction = 0;
            lastMonth = '';
          }
          lastYear = curYear;
        }

        // 断月重置：开启时，与上一月份间隔 >1 个月则重新起算
        let isGap = false;
        if (batchGapReset && lastMonth && isGapMonth(lastMonth, d.month)) {
          cumIncome = 0;
          cumTax = 0;
          cumDeduction = 0;
          lastMonth = '';
          isGap = true;
        }

        /* 同月只扣一次5000减除费用：不同月份才累加 */
        if (d.month !== lastMonth) {
          lastMonth = d.month;
          cumDeduction += 5000;
        }

        const r = calcTaxByDirection(batchDirection, d.amount, cumIncome, cumDeduction, cumTax);
        cumIncome = r.cumIncome;
        cumTax = r.cumTaxDue;

        allResults.push({
          person: group.name,
          idCard: d.idCard || group.idCard,
          phone: d.phone || group.phone,
          bankCard: d.bankCard || group.bankCard,
          ...d,
          ...r,
          _isGap: isGap,
          _isOldPolicy: false
        });
      } else {
        // 旧政策：按次预扣，不累计
        const r = batchDirection === 'forward' ? calcTaxOldPolicy(d.amount) : calcTaxReverseOldPolicy(d.amount);

        // 如果之前是新政策，现在切换到旧政策，需要重置累计
        if (lastMonth && isNewPolicy(lastMonth)) {
          cumIncome = 0;
          cumTax = 0;
          cumDeduction = 0;
        }
        lastMonth = d.month;

        allResults.push({
          person: group.name,
          idCard: d.idCard || group.idCard,
          phone: d.phone || group.phone,
          bankCard: d.bankCard || group.bankCard,
          ...d,
          ...r,
          _isGap: false,
          _isOldPolicy: true
        });
      }
    });
  });

  renderBatchResults(allResults, filename, personKeys, personsMap, identityFlags);
}

function renderBatchResults(results, filename, personKeys, personsMap, identityFlags) {
  const container = document.getElementById('batch-result');
  container.style.display = '';

  const totalPre = results.reduce((s, r) => s + r.preTax, 0);
  const totalTax = results.reduce((s, r) => s + r.currentTax, 0);
  const totalPost = results.reduce((s, r) => s + r.postTax, 0);
  const totalEmployer = results.reduce((s, r) => s + siEmployerTotal(r._siDetail), 0);

  const isSalary = incomeType === 'salary';
  const { dirLabel: directionLabel, preLabel: preColLabel, postLabel: postColLabel } = incomeIOLabels(batchDirection);

  const { hasIdCard, hasPhone, hasBankCard } = identityFlags || {};

  // 按人分组（用 personKey 分组）
  const grouped = {};
  results.forEach(r => {
    const key = r.idCard ? 'ID:' + r.idCard : (r.personKey || r.person);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  });

  // 生成每人一块的 HTML
  let seq = 0;
  const personBlocks = personKeys.map(key => {
    const rows = grouped[key];
    if (!rows) return '';

    const personName = rows[0].person;
    const personIdCard = rows[0].idCard || '';
    const personPhone = rows[0].phone || '';
    const personBankCard = rows[0].bankCard || '';

    // 按年分组
    const yearGroups = {};
    rows.forEach(r => {
      const yr = r.month.split('-')[0] || '-';
      if (!yearGroups[yr]) yearGroups[yr] = [];
      yearGroups[yr].push(r);
    });
    const years = Object.keys(yearGroups).sort();

    let personPre = 0, personTax = 0, personPost = 0, personEmployer = 0;
    rows.forEach(r => {
      personPre += r.preTax; personTax += r.currentTax; personPost += r.postTax;
      personEmployer += siEmployerTotal(r._siDetail);
    });

    // 构建身份信息标签
    let idBadges = '';
    if (hasIdCard && personIdCard) idBadges += `<span style="font-size:11px;color:var(--t-text-2);margin-left:8px;"> ${personIdCard.slice(0,6)}****${personIdCard.slice(-4)}</span>`;
    if (hasPhone && personPhone) idBadges += `<span style="font-size:11px;color:var(--t-text-2);margin-left:8px;"> ${personPhone.slice(0,3)}****${personPhone.slice(-4)}</span>`;
    if (hasBankCard && personBankCard) idBadges += `<span style="font-size:11px;color:var(--t-text-2);margin-left:8px;"> ${personBankCard}</span>`;

    // 表头额外列
    let extraHeadCols = '';
    if (hasIdCard) extraHeadCols += '<th>身份证号</th>';
    if (hasPhone) extraHeadCols += '<th>电话</th>';
    if (hasBankCard) extraHeadCols += '<th>银行卡号</th>';

    let yearSections = '';
    years.forEach((yr, yi) => {
      const yRows = yearGroups[yr];
      const gapColspan = (isSalary ? 14 : 9) + (hasIdCard?1:0) + (hasPhone?1:0) + (hasBankCard?1:0);
      const yearSep = yi > 0
        ? yearResetRowHTML(gapColspan, yr)
        : '';

      const dataRows = yRows.map(r => {
        seq++;
        let extraCols = '';
        if (hasIdCard) extraCols += `<td style="font-size:12px;color:var(--t-text-2);">${r.idCard || '-'}</td>`;
        if (hasPhone) extraCols += `<td style="font-size:12px;color:var(--t-text-2);">${r.phone || '-'}</td>`;
        if (hasBankCard) extraCols += `<td style="font-size:12px;color:var(--t-text-2);">${r.bankCard || '-'}</td>`;

        const gapMarker = r._isGap ? gapResetRowHTML(gapColspan, r.month) : '';

        const oldPolicyMarker = r._isOldPolicy ? oldPolicyRowHTML(gapColspan, r.month) : '';

        const cityWarnMarker = (r._cityUnknown || r._yearFallback)
          ? `<tr style="background:var(--t-warning-bg);"><td colspan="${gapColspan}" style="text-align:center;padding:8px;font-weight:600;color:var(--t-warning);font-size:12px;"> ${r.month}：${r._cityUnknown ? `城市「${r.city}」未识别，已回退全局城市；` : ''}${r._yearFallback ? '政策年度未精确匹配，已用最新年度' : ''}</td></tr>`
          : '';

        const siTitle = r._siDetail
          ? ` title="养老 ¥${formatNum(r._siDetail.pension)} / 医疗 ¥${formatNum(r._siDetail.medical)} / 失业 ¥${formatNum(r._siDetail.unemployment)} / 公积金 ${formatRate(r._siDetail.fundRateUsed)} ¥${formatNum(r._siDetail.fund)}"`
          : (r._siMissing ? ' title="行内与全局均未设置基数，三险一金按 0 计算"' : '');
        const erTitle = siEmployerTooltip(r._siDetail);
        const isBonusRow = !!r._isBonus;
        const bonusSep = isBonusRow && r._bonusSeparate;
        const cumCell = (v) => (bonusSep ? '—' : `¥${formatNum(v)}`);

        return gapMarker + oldPolicyMarker + cityWarnMarker + `
          <tr${isBonusRow ? ' style="background:rgba(22,119,255,0.06);"' : ''}>
            <td>${seq}</td>
            <td>${r.month}</td>
            ${isSalary ? `<td>${r.cityName || '-'}</td><td style="font-size:12px;color:var(--t-text-2);">${r.policyYearLabel || '-'}</td>` : ''}
            ${extraCols}
            <td>¥${formatNum(batchDirection === 'forward' ? r.preTax : r.postTax)}</td>
            ${isSalary ? `<td${siTitle}${r._siMissing ? ' style="color:var(--t-warning);"' : ''}>¥${formatNum(r.socialInsurance || 0)}</td><td${erTitle}>¥${formatNum(siEmployerTotal(r._siDetail))}</td><td>¥${formatNum(r.extraDeduction || 0)}</td>` : ''}
            <td>${cumCell(r.cumIncome)}</td>
            <td>${cumCell(r.cumDeduction)}</td>
            <td>${formatRate(r.rate)}<div style="font-size:10px;color:var(--t-text-2);">速算 ${formatNum(r.quick)}${isSalary && isBonusRow ? '（÷12）' : ''}</div></td>
            <td class="tax-col">¥${formatNum(r.currentTax)}</td>
            <td class="highlight">¥${formatNum(batchDirection === 'forward' ? r.postTax : r.preTax)}</td>
            <td>${isSalary ? (isBonusRow ? `年终奖·${r._bonusStrategy === 'combined' ? '并入综合所得' : '单独计税'}` : '累计预扣') : (r._isOldPolicy ? '旧政策' : '新政策')}</td>
          </tr>`;
      }).join('');

      yearSections += yearSep + dataRows;
    });

    const totalColspan = 2 + (hasIdCard?1:0) + (hasPhone?1:0) + (hasBankCard?1:0);

    return `
      <div style="margin-bottom:24px;">
        <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--t-bg-header);border-radius:8px 8px 0 0;border:1px solid var(--t-border);border-bottom:none;">
          <span style="font-size:15px;font-weight:700;color:var(--t-text);"> ${personName}</span>
          ${idBadges}
          <span style="font-size:12px;color:var(--t-text-2);margin-left:8px;">共 ${rows.length} 条</span>
          <span style="font-size:12px;color:var(--t-text-2);margin-left:auto;">税额合计 <span style="color:var(--t-error);font-weight:600;">¥${formatNum(personTax)}</span></span>
          ${isSalary ? `<span style="font-size:12px;color:var(--t-text-2);">单位社保 <span style="color:var(--t-text-2);font-weight:600;">¥${formatNum(personEmployer)}</span></span>
          <span style="font-size:12px;color:var(--t-text-2);">企业总成本 <span style="color:var(--t-warning);font-weight:600;">¥${formatNum(round2(personPre + personEmployer))}</span></span>` : ''}
        </div>
        <div style="overflow-x:auto;border:1px solid var(--t-border);border-radius:0 0 8px 8px;">
          <table class="result-table">
            <thead>
              <tr>
                <th>#</th>
                <th>月份</th>
                ${isSalary ? '<th>城市</th><th>政策年度</th>' : ''}
                ${extraHeadCols}
                <th>${preColLabel}</th>
                ${isSalary ? '<th>三险一金(个人)</th><th>单位社保公积金</th><th>专项附加</th>' : ''}
                <th>${isSalary ? '累计应发金额' : '累计发放金额'}</th>
                <th>累计减除费用</th>
                <th>适用税率</th>
                <th>预扣税额</th>
                <th>${postColLabel}</th>
                <th>${isSalary ? '计税方式' : '政策类型'}</th>
              </tr>
            </thead>
            <tbody>
              ${yearSections}
              <tr class="total-row">
                <td colspan="${totalColspan}">小计</td>
                <td>¥${formatNum(batchDirection === 'forward' ? personPre : personPost)}</td>
                ${isSalary ? `<td></td><td></td><td>¥${formatNum(rows.reduce((s, r) => s + (r.socialInsurance || 0), 0))}</td><td>¥${formatNum(personEmployer)}</td><td>¥${formatNum(rows.reduce((s, r) => s + (r.extraDeduction || 0), 0))}</td>` : ''}
                <td></td>
                <td>¥${formatNum(rows.reduce((s, r) => s + (r.cumDeduction || 0), 0))}</td>
                <td></td>
                <td class="tax-col">¥${formatNum(personTax)}</td>
                <td class="highlight">¥${formatNum(batchDirection === 'forward' ? personPost : personPre)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="summary-grid">
      <div class="summary-item">
        <div class="label">总记录数</div>
        <div class="value blue">${results.length}</div>
      </div>
      <div class="summary-item">
        <div class="label">涉及人数</div>
        <div class="value blue">${personKeys.length}</div>
      </div>
      <div class="summary-item">
        <div class="label">累计税额</div>
        <div class="value red">¥${formatNum(totalTax)}</div>
      </div>
      <div class="summary-item">
        <div class="label">${isSalary ? '累计实发' : '累计税后'}</div>
        <div class="value green">¥${formatNum(totalPost)}</div>
      </div>
      ${isSalary ? `
      <div class="summary-item">
        <div class="label">单位社保公积金</div>
        <div class="value" style="color:var(--t-text-2);">¥${formatNum(totalEmployer)}</div>
      </div>
      <div class="summary-item">
        <div class="label">企业用工总成本</div>
        <div class="value orange">¥${formatNum(round2(totalPre + totalEmployer))}</div>
      </div>` : ''}
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
      <span style="background:var(--t-primary);color:#fff;font-size:12px;padding:5px 14px;border-radius:20px;font-weight:700;"> ${directionLabel}</span>
      <span style="color:var(--t-text-2);font-size:13px;">计算模式</span>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-bottom:12px;flex-wrap:wrap;">
      <button class="btn btn-secondary" style="padding:6px 14px;font-size:12px;" onclick="PageBatch.resetBatch()"> 重置数据</button>
      ${isSalary ? `<button class="btn btn-green" style="padding:6px 14px;font-size:12px;" onclick="PageBatch.exportBatchExcelFormula()"> 导出 Excel（公式明细）</button>` : ''}
      <button class="btn btn-green" style="padding:6px 14px;font-size:12px;" onclick="PageBatch.exportBatchCSV()"> 导出结果 CSV</button>
    </div>
    ${personBlocks}
  `;

  window._batchResults = results;
}

function exportBatchCSV() {
  if (!window._batchResults) return;
  const results = window._batchResults;
  const isSalary = incomeType === 'salary';
  const { preLabel, postLabel } = incomeIOLabels(batchDirection);

  // 检测哪些身份列有数据
  const { hasIdCard, hasPhone, hasBankCard } = identityFlagsOf(results);

  // 按人 → 月排序后导出
  const sorted = [...results].sort((a, b) => {
    const ka = (a.idCard || a.person) + '|' + a.month;
    const kb = (b.idCard || b.person) + '|' + b.month;
    return ka.localeCompare(kb);
  });

  // 构建表头
  let headerCols = '姓名';
  if (hasIdCard) headerCols += ',身份证号';
  if (hasPhone) headerCols += ',电话';
  if (hasBankCard) headerCols += ',银行卡号';
  if (isSalary) {
    headerCols += `,月份,城市,政策年度,${preLabel},三险一金(个人),单位社保公积金,公积金比例,专项附加扣除,累计应发金额,累计减除费用,累计应纳税所得额,适用税率,速算扣除数,本期预扣税额,${postLabel},企业用工总成本,计税方式`;
  } else {
    headerCols += `,月份,${preLabel},本次预扣收入额,累计发放金额,累计减除费用,累计应纳税所得额,适用税率,速算扣除数,本期预扣税额,${postLabel},政策类型`;
  }

  const rows = sorted.map(r => {
    let cols = `"${r.person}"`;
    if (hasIdCard) cols += `,"${r.idCard || ''}"`;
    if (hasPhone) cols += `,"${r.phone || ''}"`;
    if (hasBankCard) cols += `,"${r.bankCard || ''}"`;
    const inAmt = round2(batchDirection === 'forward' ? r.preTax : r.postTax);
    const outAmt = round2(batchDirection === 'forward' ? r.postTax : r.preTax);
    const bonusSep = r._isBonus && r._bonusSeparate;
    const erTotal = siEmployerTotal(r._siDetail);
    if (isSalary) {
      const method = r._isBonus
        ? `年终奖(${r._bonusStrategy === 'combined' ? '并入综合所得' : '单独计税'})`
        : `累计预扣${r._siMissing ? '(三险一金未设置)' : ''}${r._cityUnknown ? '(城市未识别)' : ''}${r._yearFallback ? '(年度未匹配)' : ''}`;
      cols += `,"${r.month}","${r.cityName || ''}","${r.policyYearLabel || ''}",${inAmt},${round2(r.socialInsurance || 0)},${round2(erTotal)},${r._siDetail ? formatRate(r._siDetail.fundRateUsed) : ''},${round2(r.extraDeduction || 0)},${bonusSep ? '' : round2(r.cumIncome)},${bonusSep ? '' : round2(r.cumDeduction || 0)},${bonusSep ? '' : round2(r.taxableIncome)},${formatRate(r.rate)},${round2(r.quick || 0)},${round2(r.currentTax)},${outAmt},${round2(inAmt + erTotal)},${method}`;
    } else {
      cols += `,"${r.month}",${inAmt},${round2(r.withholdingIncome)},${round2(r.cumIncome)},${round2(r.cumDeduction || 0)},${round2(r.taxableIncome)},${formatRate(r.rate)},${round2(r.quick || 0)},${round2(r.currentTax)},${outAmt},${r._isOldPolicy ? '旧政策' : '新政策'}`;
    }
    return cols;
  }).join('\n');

  downloadFile(headerCols + '\n' + rows, '批量个税计算结果.csv', 'text/csv');
}


  window.PageBatch = { COL_KEYWORDS,COL_TYPE_LABELS,_accumFileCount,_accumRows,_accumSources,_pendingFiles,_previewSourceId,analyzeSheet,analyzeWorkbookSheets,buildBatchSourceLabel,buildMonthFromParts,buildSourceItem,collectPreviewRows,collectSelectedRows,compareMonth,confirmColumnMapping,detectColumnMapping,exportBatchCSV,exportBatchExcelFormula,extractMonthHint,extractMonthHintFromRows,extractSortDateTime,extractYearHint,getAmountColumnScore,getColumnMatchScore,getSheetNameScore,handleFile,handleFiles,isAmountHeaderExcluded,isAmountLikeNumber,isGarbled,isHeaderContinuation,isSummaryLikeRow,isSummaryLikeText,makeBatchBonusSeparateRow,makeBatchBonusSynthRec,mergeHeaderRows,normalizeMonth,normalizeMonthWithHint,onFileParsed,onMappingChange,parseCSV,processFile,processWithMapping,readExcel,refreshBatchPreview,renderBatchResults,renderSourceSelectionHTML,resetBatch,rowHasStrongIdentity,rowHasUsableIdentity,runBatchCalc,runBatchSalaryPass,runBatchSalaryPerson,sanitizeBankCard,sanitizeIdCard,sanitizeName,sanitizePhone,scoreDataCoverage,selectOnlySource,setPreviewSource,showBatchPreview,showColumnMappingUI,smartDetectTable,tagSourceRows,toggleBatchSource,togglePersonTable,togglePreviewTable,updateAccumIndicator,uploadArea };
})();
