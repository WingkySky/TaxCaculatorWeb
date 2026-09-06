/* ============================================================
 * page-rules.js — PageRules 计算规则页
 * 职责：从 TaxEngine 渲染各计税方式对应的税率表
 *       （累计预扣年度表 × 劳务/工资两份、年终奖按月换算表、年终奖无效区间），
 *       与计算引擎共用同一份数据，避免规则展示与实际计税漂移；
 *       劳务/工资内容块的显隐由 App.setIncomeType 跟随顶部所得类型切换。
 * 对外接口：window.PageRules。依赖：TaxEngine/TaxUtils。
 * ============================================================ */
(function () {
'use strict';

  const fmt = v => TaxUtils.formatNum(v).replace(/\.00$/, '');

  /** 累进表第 i 档的区间描述（与上一档 upTo 拼接） */
  function rangeLabel(brackets, i) {
    const b = brackets[i], prev = brackets[i - 1];
    if (i === 0) return `不超过 ${fmt(b.upTo)} 元`;
    if (!isFinite(b.upTo)) return `超过 ${fmt(prev.upTo)} 元`;
    return `超过 ${fmt(prev.upTo)} 元至 ${fmt(b.upTo)} 元`;
  }

  /** 累进表渲染（首列表头按用途传入）：累计预扣年度表与年终奖 ÷12 月度表共用同一结构 */
  function bracketTableHTML(firstLabel, brackets) {
    return `
      <thead><tr><th style="text-align:left;">${firstLabel}</th><th>税率</th><th>速算扣除数</th></tr></thead>
      <tbody>
        ${brackets.map((b, i) => `<tr>
          <td class="label-col">${rangeLabel(brackets, i)}</td>
          <td>${TaxUtils.formatRate(b.rate)}</td>
          <td>${fmt(b.quick)}</td>
        </tr>`).join('')}
      </tbody>`;
  }

  /** 年终奖无效区间（from, to]，from 本身按下沿发放即最优 */
  function trapTableHTML(zones) {
    return `
      <thead><tr><th style="text-align:left;">无效区间（税前奖金，元）</th><th>建议发放（元）</th></tr></thead>
      <tbody>
        ${zones.map(z => `<tr>
          <td class="label-col">${fmt(z.from)} ~ ${fmt(z.to)}</td>
          <td style="color:var(--t-primary);font-weight:600;">${fmt(z.suggest)}</td>
        </tr>`).join('')}
      </tbody>`;
  }

  function render() {
    const E = window.TaxEngine;
    if (!E) return;
    const put = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    put('rules-table-labor', bracketTableHTML('累计应纳税所得额', E.BRACKETS));
    put('rules-table-salary', bracketTableHTML('累计应纳税所得额', E.BRACKETS));
    put('rules-table-bonus', bracketTableHTML('奖金 ÷ 12（月度金额）', E.MONTHLY_BRACKETS));
    put('rules-table-trap', trapTableHTML(E.BONUS_TRAP_ZONES));
  }

  window.PageRules = { render };
})();
