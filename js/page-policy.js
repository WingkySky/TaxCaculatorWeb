/* ============================================================
 * page-policy.js — PagePolicy 政策库页
 * 职责：政策库编辑器渲染、城市/年度增删、Excel/JSON 导入导出、存储状态展示。
 * 对外接口：window.PagePolicy。依赖：PolicyLib/UI/Exporter/TaxUtils。
 * ============================================================ */
(function () {
'use strict';
  const renderSalaryItemsTable = (...a) => PageParams.renderSalaryItemsTable(...a);
  const round2 = (...a) => TaxUtils.round2(...a);
  const CITY_POLICY_LIBRARY = PolicyLib.CITY_POLICY_LIBRARY;
  const clearPolicyLibraryStorage = (...a) => PolicyLib.clearPolicyLibraryStorage(...a);
  const normalizePolicyLibrary = (...a) => PolicyLib.normalizePolicyLibrary(...a);
  const _policyCache = PolicyLib._policyCache;
  const onCityParamChange = (...a) => PageParams.onCityParamChange(...a);
  const fundItem = (...a) => PolicyLib.fundItem(...a);
  const rowsToLibrary = (...a) => PolicyLib.rowsToLibrary(...a);
  const savePolicyLibrary = (...a) => PolicyLib.savePolicyLibrary(...a);
  const libraryToRows = (...a) => PolicyLib.libraryToRows(...a);
  const SI_ITEM_LABELS = PolicyLib.SI_ITEM_LABELS;
  const FUND_RATES_STD = PolicyLib.FUND_RATES_STD;
  const SI_ITEMS = PolicyLib.SI_ITEMS;
  const ensureXLSX = (...a) => Exporter.ensureXLSX(...a);
  const siItem = (...a) => PolicyLib.siItem(...a);

// ==================== 政策数据管理弹层 ====================

window._pmCity = 'custom';
window._pmYear = '';

function openPolicyModal() {
  // 政策库已从弹层升级为独立页面：保留「首次跟随工资参数城市」的语义，改为导航
  if (!window._pmModalInitialized && CITY_POLICY_LIBRARY[salaryParams.cityId]) {
    window._pmCity = salaryParams.cityId;
  }
  window._pmModalInitialized = true;
  if (window.App) App.navigate('policy');
  onPmCityChange();
}

function closePolicyModal() {
  if (window.App) App.navigate('params');
}

function pmCityOptionsHTML() {
  return Object.entries(CITY_POLICY_LIBRARY).map(([key, city]) =>
    `<option value="${key}" ${key === window._pmCity ? 'selected' : ''}>${city.name}</option>`).join('');
}

function onPmCityChange() {
  const sel = document.getElementById('pm-city');
  // 每次按政策库重建城市选项（首次打开/新增城市/导入后保持同步）；
  // 用户切换时优先采用下拉当前值，失效时回退到上次城市或自定义。
  const wanted = sel.value || window._pmCity;
  sel.innerHTML = pmCityOptionsHTML();
  window._pmCity = CITY_POLICY_LIBRARY[wanted] ? wanted
    : (CITY_POLICY_LIBRARY[window._pmCity] ? window._pmCity : 'custom');
  sel.value = window._pmCity;
  const city = CITY_POLICY_LIBRARY[window._pmCity];
  const yearKeys = Object.keys(city.years);
  if (!yearKeys.includes(window._pmYear)) window._pmYear = yearKeys[0];
  const yearSel = document.getElementById('pm-year');
  yearSel.innerHTML = yearKeys.map(yk =>
    `<option value="${yk}" ${yk === window._pmYear ? 'selected' : ''}>${city.years[yk].label || yk}</option>`).join('');
  onPmYearChange();
}

function onPmYearChange() {
  const sel = document.getElementById('pm-year');
  window._pmYear = sel.value;
  renderPolicyEditor();
}

/** 弹层顶部存储状态提示 */
function updatePmStorageStatus() {
  const el = document.getElementById('pm-storage-status');
  if (!el) return;
  if (window._policyStorageAvailable === false) {
    el.innerHTML = ' 当前浏览器环境不支持本地存储（如隐私模式），修改仅本次会话有效——请务必导出 Excel / JSON 备份。';
    return;
  }
  if (window._policyFromStorage) {
    el.innerHTML = ` 政策数据已自动保存到本机浏览器（localStorage${window._policySavedAt ? '，更新于 ' + window._policySavedAt : ''}），刷新/重启后自动加载。<strong>不跨浏览器、不跨电脑，清除浏览器数据会丢失</strong>——跨机或长期备份请导出 Excel / JSON。`;
  } else {
    el.innerHTML = '当前使用 tax-policy-data.js 的默认数据；在下方修改后会自动保存到本机浏览器，之后每次打开自动加载。';
  }
}

function renderPolicyEditor() {
  updatePmStorageStatus();
  const lib = CITY_POLICY_LIBRARY[window._pmCity];
  const rec = lib && lib.years[window._pmYear];
  const effStart = document.getElementById('pm-eff-start');
  const effEnd = document.getElementById('pm-eff-end');
  const label = document.getElementById('pm-label');
  if (!rec) {
    effStart.value = ''; effEnd.value = ''; label.value = '';
    document.getElementById('pm-items-wrap').innerHTML = '<div style="color:var(--t-text-2);font-size:13px;">请选择或新增年度</div>';
    return;
  }
  effStart.value = rec.effective ? rec.effective[0] : '';
  effEnd.value = rec.effective ? rec.effective[1] : '';
  label.value = rec.label || '';
  const numInput = (cityKey, yk, itemKey, field, value, step, placeholder) =>
    `<input class="pm-item-input" type="number" step="${step}" placeholder="${placeholder || ''}" value="${value == null ? '' : value}"
      onchange="PagePolicy.onPmItemInput('${cityKey}','${yk}','${itemKey}','${field}',this.value)">`;
  document.getElementById('pm-items-wrap').innerHTML = `
    <div style="overflow-x:auto;border:1px solid var(--t-border);border-radius:8px;">
      <table class="result-table" style="font-size:12px;">
        <thead><tr><th>险种</th><th>个人比例（%）</th><th>单位比例（%）</th><th>基数下限</th><th>基数上限</th><th>公积金比例档（%，逗号分隔）</th></tr></thead>
        <tbody>
          ${SI_ITEMS.map(it => {
            const item = rec.items[it.key];
            if (!item) return `<tr><td>${SI_ITEM_LABELS[it.key]}</td><td colspan="5" style="color:var(--t-text-2);">—</td></tr>`;
            const isFund = it.key === 'fund';
            return `<tr>
              <td>${it.label}${item.pending ? ' <span style="color:var(--t-warning);font-size:10px;">待核对</span>' : ''}</td>
              <td>${numInput(window._pmCity, window._pmYear, it.key, 'personal', round2((item.personal || 0) * 100), 0.1, '8')}</td>
              <td>${numInput(window._pmCity, window._pmYear, it.key, 'employer', item.employer == null ? '' : round2(item.employer * 100), 0.1, isFund ? '同个人档' : '0')}</td>
              <td>${numInput(window._pmCity, window._pmYear, it.key, 'lower', item.lower, 0.01, '不限')}</td>
              <td>${numInput(window._pmCity, window._pmYear, it.key, 'upper', item.upper, 0.01, '不限')}</td>
              <td>${isFund ? `<input class="pm-item-input" value="${(item.rates || []).map(r => round2(r * 100)).join(',')}"
                    onchange="PagePolicy.onPmFundRatesInput(this.value)">` : '<span style="color:var(--t-text-2);">—</span>'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="font-size:11px;color:var(--t-text-2);margin-top:6px;">比例与上下限留空表示不限制；公积金单位比例留空表示与个人同档；修改后立即生效（编辑过的险种会移除「待核对」标记）。</div>`;
}

function onPmItemInput(cityKey, yk, itemKey, field, value) {
  const lib = CITY_POLICY_LIBRARY[cityKey];
  const rec = lib && lib.years[yk];
  const it = rec && rec.items[itemKey];
  if (!it) return;
  const raw = String(value).trim();
  if (raw === '' || field === 'lower' || field === 'upper') {
    const n = parseFloat(raw);
    it[field] = (raw === '' || isNaN(n)) ? null : n;
  } else {
    const n = parseFloat(raw);
    if (!isNaN(n)) it[field] = n / 100;
  }
  delete it.pending;
  _policyCache.clear();
  savePolicyLibrary();
  renderPolicyEditor();
  renderSalaryItemsTable();
}

function onPmFundRatesInput(value) {
  const lib = CITY_POLICY_LIBRARY[window._pmCity];
  const rec = lib && lib.years[window._pmYear];
  const it = rec && rec.items.fund;
  if (!it) return;
  const rates = String(value).split(/[,，]/).map(s => parseFloat(s) / 100).filter(n => !isNaN(n) && n > 0);
  if (rates.length) { it.rates = rates; delete it.pending; }
  _policyCache.clear();
  savePolicyLibrary();
  renderSalaryItemsTable();
}

function onPmEffectiveChange() {
  const lib = CITY_POLICY_LIBRARY[window._pmCity];
  const rec = lib && lib.years[window._pmYear];
  if (!rec) return;
  const s = document.getElementById('pm-eff-start').value.trim();
  const e = document.getElementById('pm-eff-end').value.trim();
  const ymRe = /^\d{4}-\d{2}$/;
  rec.effective = [ymRe.test(s) ? s : '2000-01', ymRe.test(e) ? e : '2999-12'];
  _policyCache.clear();
  savePolicyLibrary();
  renderSalaryItemsTable();
}

function onPmLabelChange() {
  const lib = CITY_POLICY_LIBRARY[window._pmCity];
  const rec = lib && lib.years[window._pmYear];
  if (rec) rec.label = document.getElementById('pm-label').value.trim() || window._pmYear;
  _policyCache.clear();
  savePolicyLibrary();
  renderSalaryItemsTable();
}

function pmAddCity() {
  const name = prompt('新增城市名称（如：长沙）：');
  if (!name || !name.trim()) return;
  const clean = name.trim();
  if (Object.values(CITY_POLICY_LIBRARY).some(c => c.name === clean)) return alert('该城市已存在');
  const key = 'c' + Date.now().toString(36);
  CITY_POLICY_LIBRARY[key] = {
    name: clean,
    years: {
      custom: {
        label: clean + '政策',
        effective: ['2000-01', '2999-12'],
        pending: true,
        items: {
          pension:      siItem(0.08, null, null, 0.16),
          medical:      siItem(0.02, null, null, 0.08),
          unemployment: siItem(0.005, null, null, 0.005),
          injury:       siItem(0, null, null, 0.002),
          fund:         fundItem(FUND_RATES_STD.slice(), 0.05, null, null)
        }
      }
    }
  };
  _policyCache.clear();
  savePolicyLibrary();
  window._pmCity = key;
  onPmCityChange();
}

function pmAddYear() {
  const yk = prompt('新增年度键（如 2025）：');
  if (!yk || !/^\d{4}$/.test(yk.trim())) return alert('年度键需为 4 位年份');
  const key = yk.trim();
  const lib = CITY_POLICY_LIBRARY[window._pmCity];
  if (lib.years[key]) return alert('该年度已存在');
  lib.years[key] = {
    label: key + '年度',
    effective: [key + '-01', key + '-12'],
    pending: true,
    items: JSON.parse(JSON.stringify(Object.values(lib.years)[0].items))
  };
  _policyCache.clear();
  savePolicyLibrary();
  window._pmYear = key;
  onPmCityChange();
}

function pmDeleteYear() {
  const lib = CITY_POLICY_LIBRARY[window._pmCity];
  const yearKeys = Object.keys(lib.years);
  if (yearKeys.length <= 1) return alert('至少保留一个年度');
  if (!confirm(`确认删除「${lib.name} ${lib.years[window._pmYear].label || window._pmYear}」？`)) return;
  delete lib.years[window._pmYear];
  window._pmYear = Object.keys(lib.years)[0];
  _policyCache.clear();
  savePolicyLibrary();
  onPmCityChange();
}

/** 清除本机存档，恢复为 tax-policy-data.js 种子数据 */
function pmResetToSeed() {
  if (!confirm('将清除本机浏览器中保存的政策数据，恢复为 tax-policy-data.js 中的默认数据，确认？')) return;
  clearPolicyLibraryStorage();
  const seed = (window.CITY_POLICY_LIBRARY_DATA && typeof window.CITY_POLICY_LIBRARY_DATA === 'object')
    ? JSON.parse(JSON.stringify(window.CITY_POLICY_LIBRARY_DATA))
    : null;
  Object.keys(CITY_POLICY_LIBRARY).forEach(k => delete CITY_POLICY_LIBRARY[k]);
  if (seed) {
    Object.assign(CITY_POLICY_LIBRARY, seed);
    normalizePolicyLibrary(CITY_POLICY_LIBRARY);
  } else if (!CITY_POLICY_LIBRARY.custom) {
    CITY_POLICY_LIBRARY.custom = {
      name: '自定义',
      years: { custom: { label: '自定义政策', effective: ['2000-01', '2999-12'], pending: true, items: {
        pension: siItem(0.08, null, null, 0.16), medical: siItem(0.02, null, null, 0.08),
        unemployment: siItem(0.005, null, null, 0.005), injury: siItem(0, null, null, 0.002),
        fund: fundItem(FUND_RATES_STD.slice(), 0.05, null, null)
      } } }
    };
  }
  if (!CITY_POLICY_LIBRARY[salaryParams.cityId]) salaryParams.cityId = 'custom';
  window._pmCity = CITY_POLICY_LIBRARY[salaryParams.cityId] ? salaryParams.cityId : Object.keys(CITY_POLICY_LIBRARY)[0];
  window._policyFromStorage = false;
  window._policySavedAt = '';
  _policyCache.clear();
  onPmCityChange();
  onCityParamChange();
}

function pmExportJSON() {
  downloadFile(JSON.stringify(CITY_POLICY_LIBRARY, null, 2), '城市社保公积金政策库.json', 'application/json');
}


function applyImportedLibrary(lib, errors) {
  Object.keys(CITY_POLICY_LIBRARY).forEach(k => delete CITY_POLICY_LIBRARY[k]);
  Object.assign(CITY_POLICY_LIBRARY, lib);
  if (!CITY_POLICY_LIBRARY.custom) {
    CITY_POLICY_LIBRARY.custom = {
      name: '自定义',
      years: { custom: { label: '自定义政策', effective: ['2000-01', '2999-12'], pending: true, items: {
        pension: siItem(0.08, null, null, 0.16), medical: siItem(0.02, null, null, 0.08),
        unemployment: siItem(0.005, null, null, 0.005), injury: siItem(0, null, null, 0.002),
        fund: fundItem(FUND_RATES_STD.slice(), 0.05, null, null)
      } } }
    };
  }
  normalizePolicyLibrary(CITY_POLICY_LIBRARY);
  if (!CITY_POLICY_LIBRARY[salaryParams.cityId]) salaryParams.cityId = 'custom';
  window._pmCity = Object.keys(CITY_POLICY_LIBRARY)[0];
  _policyCache.clear();
  savePolicyLibrary();
  onPmCityChange();
  onCityParamChange();
  alert(`导入成功：${Object.keys(CITY_POLICY_LIBRARY).length} 个城市${errors && errors.length ? `（${errors.length} 条问题行已跳过，详见控制台）` : ''}`);
  if (errors && errors.length) console.warn('政策库导入问题行：', errors);
}

function pmExportExcel() {
  ensureXLSX(() => {
    const rows = libraryToRows(CITY_POLICY_LIBRARY);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 11 }, { wch: 11 }, { wch: 30 }, { wch: 13 }, { wch: 11 }, { wch: 11 }, { wch: 10 }, { wch: 10 }, { wch: 22 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '政策库');
    XLSX.writeFile(wb, '城市社保公积金政策库.xlsx');
  });
}

function pmImportExcel(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  ensureXLSX(() => {
    const reader = new FileReader();
    reader.onload = e => {
      let wb;
      try {
        wb = XLSX.read(e.target.result, { type: 'array' });
      } catch (err) {
        return alert('Excel 解析失败：' + err.message);
      }
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
      const { library, errors } = rowsToLibrary(rows);
      if (Object.keys(library).length === 0) return alert('导入失败：' + (errors[0] || '未解析到有效数据'));
      if (!confirm(`导入将覆盖当前政策库（解析到 ${Object.keys(library).length} 个城市${errors.length ? `，${errors.length} 条问题行已跳过` : ''}），确认继续？`)) return;
      applyImportedLibrary(library, errors);
    };
    reader.readAsArrayBuffer(file);
  });
}

function pmImportJSON(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    let data;
    try {
      data = JSON.parse(e.target.result);
    } catch (err) {
      return alert('JSON 解析失败：' + err.message);
    }
    const valid = data && typeof data === 'object' && Object.values(data).every(city =>
      city && typeof city.name === 'string' && city.years && typeof city.years === 'object');
    if (!valid) return alert('格式不符：需要 { 城市key: { name, years: { 年度: { effective, items } } } } 结构');
    if (!confirm('导入将覆盖当前整个政策库，确认继续？')) return;
    applyImportedLibrary(data);
  };
  reader.readAsText(file, 'utf-8');
}


  window.PagePolicy = { applyImportedLibrary,closePolicyModal,onPmCityChange,onPmEffectiveChange,onPmFundRatesInput,onPmItemInput,onPmLabelChange,onPmYearChange,openPolicyModal,pmAddCity,pmAddYear,pmCityOptionsHTML,pmDeleteYear,pmExportExcel,pmExportJSON,pmImportExcel,pmImportJSON,pmResetToSeed,renderPolicyEditor,updatePmStorageStatus };
})();
