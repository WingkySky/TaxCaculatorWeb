/* ============================================================
 * policy-library.js — PolicyLib 城市社保公积金政策库
 * 职责：政策库结构定义、localStorage 三层持久化、normalize 规范化、
 *       按城市+月份解析政策（resolvePolicy）、基数 clamp、Excel 行转换。
 * 对外接口：window.PolicyLib。依赖：TaxUtils、tax-policy-data.js 种子。
 * ============================================================ */
(function () {
'use strict';
  const { round2 } = TaxUtils;

/* ==================== 城市社保公积金政策库 ====================
 * 三层结构：城市 → 年度（含生效月区间）→ 险种（养老/医疗(含生育)/失业/工伤/公积金）
 * 每个险种：personal 个人比例(小数)、employer 单位比例(小数)、lower/upper 基数上下限（null = 不限）
 * 公积金额外：rates 可选比例数组（公司择档 5%~12%）；fund.employer 缺省表示单位与个人同档
 * 内置数值为参考值（pending: true），请以当地社保部门公布为准，可在政策管理弹层修改/导入。
 */
function siItem(personal, lower, upper, employer) { return { personal: personal, lower: lower, upper: upper, employer: employer || 0 }; }
function fundItem(rates, personal, lower, upper, employer) {
  const it = { personal: personal, rates: rates, lower: lower, upper: upper };
  if (employer != null) it.employer = employer;
  return it;
}

const SI_ITEMS = [
  { key: 'pension', label: '养老' },
  { key: 'medical', label: '医疗(含生育)' },
  { key: 'unemployment', label: '失业' },
  { key: 'injury', label: '工伤' },
  { key: 'fund', label: '公积金' },
];
const SI_ITEM_LABELS = { pension: '养老', medical: '医疗(含生育)', unemployment: '失业', injury: '工伤', fund: '公积金' };

const FUND_RATES_STD = [0.05, 0.06, 0.08, 0.10, 0.12];

/* ==================== 政策库持久化（localStorage） ====================
 * 数据分三层：
 *   1. tax-policy-data.js —— 出厂种子（跨机拷贝即用）；
 *   2. localStorage —— 本机自动存档：弹层编辑/导入后自动写入，刷新自动加载；
 *   3. Excel / JSON 导出 —— 人工备份与跨机同步。
 * localStorage 不跨浏览器、不跨电脑，清除浏览器数据会丢失；恢复种子用「恢复数据文件默认」。
 */
const POLICY_LIB_STORAGE_KEY = 'taxPolicyLibrary_v1';

function policyStorageAvailable() {
  try {
    const k = POLICY_LIB_STORAGE_KEY + '__probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch (e) {
    return false;
  }
}

/** 从 localStorage 读取本机存档；无数据或不可用时返回 null */
function loadPolicyLibrary() {
  try {
    const raw = localStorage.getItem(POLICY_LIB_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !Object.keys(data).length) return null;
    window._policySavedAt = data.__savedAt || '';
    delete data.__savedAt;
    window._policyFromStorage = true;
    return data;
  } catch (e) {
    return null;
  }
}

/** 政策库变更后写本机存档；不可用时静默降级（弹层会提示仅本次会话有效） */
function savePolicyLibrary() {
  try {
    const payload = JSON.parse(JSON.stringify(CITY_POLICY_LIBRARY));
    const d = new Date();
    window._policySavedAt = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    payload.__savedAt = window._policySavedAt;
    localStorage.setItem(POLICY_LIB_STORAGE_KEY, JSON.stringify(payload));
    window._policyFromStorage = true;
    window._policyStorageAvailable = true;
    return true;
  } catch (e) {
    window._policyStorageAvailable = false;
    console.warn('政策库本地存档失败（当前环境可能禁用了 localStorage）：', e.message);
    return false;
  }
}

function clearPolicyLibraryStorage() {
  try { localStorage.removeItem(POLICY_LIB_STORAGE_KEY); } catch (e) { /* 忽略 */ }
}

/* 政策库数据外置在同目录 tax-policy-data.js（跨机使用时拷贝该文件即可自动加载）。
 * 加载优先级：本机 localStorage 存档 > tax-policy-data.js 种子 > 仅「自定义」城市。 */
const CITY_POLICY_LIBRARY = loadPolicyLibrary() ||
  ((window.CITY_POLICY_LIBRARY_DATA && typeof window.CITY_POLICY_LIBRARY_DATA === 'object')
    ? window.CITY_POLICY_LIBRARY_DATA
    : {
      custom: {
        name: '自定义',
        years: {
          custom: {
            label: '自定义政策',
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
      }
    });
window._policyStorageAvailable = policyStorageAvailable();

/**
 * 政策库规范化：险种按 SI_ITEMS 顺序重排、字段按规范顺序重建；
 * 旧版本存档（无单位比例 employer / 无工伤 injury）从种子按字段级回退补齐，
 * 只补缺失字段，不覆盖用户已改过的任何数值。
 */
function normalizePolicyLibrary(lib) {
  const seed = (window.CITY_POLICY_LIBRARY_DATA && typeof window.CITY_POLICY_LIBRARY_DATA === 'object')
    ? window.CITY_POLICY_LIBRARY_DATA : null;
  Object.keys(lib).forEach(ck => {
    const city = lib[ck];
    if (!city || typeof city !== 'object' || !city.years || typeof city.years !== 'object') return;
    const years = {};
    Object.keys(city.years).forEach(yk => {
      const rec = city.years[yk];
      if (!rec || typeof rec !== 'object' || !rec.items || typeof rec.items !== 'object') { years[yk] = rec; return; }
      const seedRec = seed && seed[ck] && seed[ck].years && seed[ck].years[yk];
      const items = {};
      SI_ITEMS.forEach(it => {
        let item = rec.items[it.key];
        const seedItem = seedRec && seedRec.items ? seedRec.items[it.key] : null;
        // 旧存档缺整个险种（如工伤）：从种子整项补入
        if (!item && seedItem) item = JSON.parse(JSON.stringify(seedItem));
        if (!item) return;
        // 旧存档缺单位比例字段：从种子按字段回退
        if (item.employer == null && seedItem && seedItem.employer != null) item.employer = seedItem.employer;
        // 按规范字段顺序重建（保证 JSON roundtrip / 导出导入的键序一致）
        const n = (it.key === 'fund')
          ? { personal: item.personal, rates: item.rates, lower: item.lower, upper: item.upper }
          : { personal: item.personal, lower: item.lower, upper: item.upper };
        if (item.employer != null) n.employer = item.employer;
        Object.keys(item).forEach(k => { if (!(k in n)) n[k] = item[k]; });
        items[it.key] = n;
      });
      years[yk] = { label: rec.label, effective: rec.effective, pending: rec.pending, items: items };
    });
    lib[ck] = { name: city.name, years: years };
  });
}
normalizePolicyLibrary(CITY_POLICY_LIBRARY);

/* 数据文件是否缺失（仅剩自定义城市） */
function isPolicyDataFileMissing() {
  return Object.keys(CITY_POLICY_LIBRARY).length <= 1 && !!CITY_POLICY_LIBRARY.custom;
}

function findCityKey(name) {
  const s = String(name || '').trim().replace(/市$/, '');
  if (!s) return null;
  for (const [key, city] of Object.entries(CITY_POLICY_LIBRARY)) {
    if (key === 'custom') continue;
    if (s === city.name || s === key || s === city.name.replace(/市$/, '')) return key;
  }
  return null;
}

/**
 * 解析某城市某月份适用的政策年度与险种数据
 * @returns {{cityKey, city, yearKey, items, matched, label}}
 */
function resolvePolicy(cityId, month) {
  const cityKey = CITY_POLICY_LIBRARY[cityId] ? cityId : 'custom';
  const city = CITY_POLICY_LIBRARY[cityKey];
  const yearKeys = Object.keys(city.years);
  let yearKey = null;

  // 固定年度（该城市存在该年度时生效）
  if (salaryParams.policyYear !== 'auto' && city.years[salaryParams.policyYear]) {
    yearKey = salaryParams.policyYear;
  } else if (month && month !== '-') {
    for (const yk of yearKeys) {
      const eff = city.years[yk].effective || ['2000-01', '2999-12'];
      if (eff[0] <= month && month <= eff[1]) { yearKey = yk; break; }
    }
  }

  let matched = true;
  if (!yearKey) {
    // 回退：生效区间终点最新的年度，并标注未精确匹配
    const sorted = yearKeys.slice().sort((a, b) =>
      String((city.years[b].effective || [''])[1]).localeCompare(String((city.years[a].effective || [''])[1])));
    yearKey = sorted[0] || yearKeys[0];
    matched = false;
  }
  const rec = city.years[yearKey];
  return {
    cityKey: cityKey,
    city: city,
    yearKey: yearKey,
    items: rec.items,
    matched: matched,
    label: city.name + ' · ' + (rec.label || yearKey)
  };
}

/* (城市, 月份) 政策解析记忆化；政策库修改时 clear() */
const _policyCache = new Map();
function resolvePolicyMemo(cityId, month) {
  const k = cityId + '|' + month;
  if (_policyCache.has(k)) return _policyCache.get(k);
  const v = resolvePolicy(cityId, month);
  _policyCache.set(k, v);
  return v;
}

/** 险种基数 clamp；基数为 0/缺失时返回 0（由调用方决定兜底） */
function clampItemBase(base, item) {
  let v = Number(base) || 0;
  if (v <= 0) return 0;
  if (item.lower != null) v = Math.max(v, item.lower);
  if (item.upper != null) v = Math.min(v, item.upper);
  return v;
}

function libraryToRows(lib) {
  const rows = [['城市key', '城市名称', '年度', '生效起', '生效止', '年度说明', '险种', '个人比例(%)', '单位比例(%)', '基数下限', '基数上限', '公积金比例档(%)逗号分隔', '待核对']];
  Object.entries(lib).forEach(([cityKey, city]) => {
    Object.entries(city.years || {}).forEach(([yk, rec]) => {
      SI_ITEMS.forEach(it => {
        const item = rec.items ? rec.items[it.key] : null;
        if (!item) return;
        const isFund = it.key === 'fund';
        rows.push([
          cityKey,
          city.name,
          yk,
          rec.effective ? rec.effective[0] : '',
          rec.effective ? rec.effective[1] : '',
          rec.label || '',
          it.label,
          round2((item.personal || 0) * 100),
          item.employer == null ? '' : round2(item.employer * 100),
          item.lower == null ? '' : item.lower,
          item.upper == null ? '' : item.upper,
          isFund ? (item.rates || []).map(r => round2(r * 100)).join(',') : '',
          rec.pending ? '是' : ''
        ]);
      });
    });
  });
  return rows;
}

/** 扁平行 → 政策库。返回 { library, errors }；解析失败的行为收集到 errors。
 *  兼容新旧两种列布局：新布局含「单位比例(%)」列；旧布局（无该列）导入后单位比例由种子回退补齐。 */
function rowsToLibrary(rows) {
  const errors = [];
  const lib = {};
  const labelToKey = {};
  SI_ITEMS.forEach(it => {
    labelToKey[it.label] = it.key;
    labelToKey[it.label.replace('(含生育)', '')] = it.key;
  });
  const hasEmployerCol = !!(rows && rows[0] && rows[0].some(c => String(c == null ? '' : c).indexOf('单位比例') >= 0));
  const COL = hasEmployerCol
    ? { personal: 7, employer: 8, lower: 9, upper: 10, rates: 11, pending: 12 }
    : { personal: 7, employer: -1, lower: 8, upper: 9, rates: 10, pending: 11 };
  const body = (rows || []).slice(1).filter(r => r && r.some(c => String(c == null ? '' : c).trim() !== ''));
  const num = v => {
    const s = String(v == null ? '' : v).trim();
    if (s === '') return null;
    const n = parseFloat(s.replace(/,/g, ''));
    return isNaN(n) ? null : n;
  };
  /* 百分数 → 小数比例：整数换算避免 5.2/100 = 0.052000000000000005 这类浮点漂移 */
  const pctToRate = n => Math.round(n * 1e6) / 1e8;
  body.forEach((r, idx) => {
    const lineNo = idx + 2;
    const cityKey = String(r[0] == null ? '' : r[0]).trim();
    const cityName = String(r[1] == null ? '' : r[1]).trim();
    const yk = String(r[2] == null ? '' : r[2]).trim();
    const effStart = String(r[3] == null ? '' : r[3]).trim();
    const effEnd = String(r[4] == null ? '' : r[4]).trim();
    const label = String(r[5] == null ? '' : r[5]).trim();
    const itemKey = labelToKey[String(r[6] == null ? '' : r[6]).trim()];
    if (!cityKey || !yk || !itemKey) {
      errors.push(`第${lineNo}行：城市key/年度缺失或险种无法识别（${r[6]}）`);
      return;
    }
    const personalPct = num(r[COL.personal]);
    const personal = personalPct == null ? null : pctToRate(personalPct);
    const employerPct = COL.employer >= 0 ? num(r[COL.employer]) : null;
    const employer = employerPct == null ? null : pctToRate(employerPct);
    const lower = num(r[COL.lower]);
    const upper = num(r[COL.upper]);
    const city = lib[cityKey] || (lib[cityKey] = { name: cityName || cityKey, years: {} });
    const rec = city.years[yk] || (city.years[yk] = {
      label: label || yk,
      effective: [effStart || '2000-01', effEnd || '2999-12'],
      pending: String(r[COL.pending] == null ? '' : r[COL.pending]).trim() === '是',
      items: {}
    });
    if (label) rec.label = label;
    if (/^\d{4}-\d{2}$/.test(effStart)) rec.effective[0] = effStart;
    if (/^\d{4}-\d{2}$/.test(effEnd)) rec.effective[1] = effEnd;
    if (itemKey === 'fund') {
      const rates = String(r[COL.rates] == null ? '' : r[COL.rates]).split(/[,，]/).map(s => pctToRate(parseFloat(s))).filter(n => !isNaN(n) && n > 0);
      const f = { personal: personal == null ? 0.05 : personal, rates: rates.length ? rates : FUND_RATES_STD.slice(), lower: lower, upper: upper };
      if (employer != null) f.employer = employer;
      rec.items.fund = f;
    } else {
      const it = { personal: personal == null ? 0 : personal, lower: lower, upper: upper };
      if (employer != null) it.employer = employer;
      rec.items[itemKey] = it;
    }
  });
  if (Object.keys(lib).length === 0) errors.push('未解析到任何有效数据行');
  return { library: lib, errors: errors };
}

  window.PolicyLib = { CITY_POLICY_LIBRARY,FUND_RATES_STD,POLICY_LIB_STORAGE_KEY,SI_ITEMS,SI_ITEM_LABELS,_policyCache,clampItemBase,clearPolicyLibraryStorage,findCityKey,fundItem,isPolicyDataFileMissing,libraryToRows,loadPolicyLibrary,normalizePolicyLibrary,policyStorageAvailable,resolvePolicy,resolvePolicyMemo,rowsToLibrary,savePolicyLibrary,siItem };
})();
