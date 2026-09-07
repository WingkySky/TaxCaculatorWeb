/* ============================================================
 * ui.js — UI 通用界面件
 * 职责：HTML 转义、备注单元格交互、内联 SVG 图标注册表。
 * 对外接口：window.UI。依赖：无。
 * ============================================================ */

(function () {
'use strict';
function escAttr(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * 备注列内容：行名一行；政策标签「城市 · 年度（明细…）」拆成主行 + 明细行，
 * 明细默认单行省略，点击展开/收起，悬浮 title 看全文，避免长方案名把行撑高
 */

function toggleNoteDetail(el) { el.classList.toggle('expanded'); }

/**
 * 移动端逐月明细（方案C 分层展开）：展开/收起紧凑行的次行明细。
 * 展开态仅是 DOM class，不入 TaxState；多行可同时展开。
 */
function toggleMobileDetailRow(btn) {
  const tr = btn.closest('tr');
  const detail = tr && tr.nextElementSibling;
  if (!detail || !detail.classList.contains('m-detail-row')) return;
  const open = detail.classList.toggle('open');
  btn.classList.toggle('open', open);
}

/**
 * 宽表滑动增强：检测 .scroll-x 容器是否可横向滚动——
 * 可滚时加 .is-scrollable（吸附首列 + 右缘淡出），滚到最右加 .at-end（隐藏淡出）。
 * 各渲染入口渲染后调用一次；滚动与窗口缩放由顶层一次性监听重算。
 */
function enhanceScrollX() {
  document.querySelectorAll('.scroll-x').forEach(box => {
    const scrollable = box.scrollWidth > box.clientWidth + 1;
    box.classList.toggle('is-scrollable', scrollable);
    if (scrollable) {
      box.classList.toggle('at-end', box.scrollLeft + box.clientWidth >= box.scrollWidth - 1);
    } else {
      box.classList.remove('at-end');
    }
  });
}

/* 滚动位置与窗口尺寸变化时重算淡出态（scroll 事件不冒泡，走捕获；绑定一次覆盖所有动态容器） */
(function bindScrollXListeners() {
  document.addEventListener('scroll', e => {
    const t = e.target;
    if (t && t.classList && t.classList.contains('scroll-x') && t.classList.contains('is-scrollable')) {
      t.classList.toggle('at-end', t.scrollLeft + t.clientWidth >= t.scrollWidth - 1);
    }
  }, true);
  window.addEventListener('resize', enhanceScrollX);
})();

/* ---------- 内联 SVG 图标（Lucide 线条风格，24×24 stroke） ---------- */
const ICON_PATHS = {
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  calculator: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><path d="M16 14h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/><path d="M16 18h.01"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  table: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/>',
  'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  settings: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  'alert-triangle': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  'alert-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  percent: '<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
};

function icon(name, size) {
  const p = ICON_PATHS[name];
  if (!p) return '';
  const s = size || 16;
  return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
}

  window.UI = { enhanceScrollX,escAttr,icon,toggleMobileDetailRow,toggleNoteDetail,ICON_PATHS };
})();
