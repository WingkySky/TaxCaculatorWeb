/* ============================================================
 * utils.js — TaxUtils 通用纯工具
 * 职责：金额/比例解析、数字格式化、取整、HTML 转义等无状态工具。
 * 对外接口：window.TaxUtils。依赖：无。
 * ============================================================ */
(function () {
'use strict';
// ==================== Utils ====================

/**
 * 解析金额字符串，支持千分位逗号（如 "11,700.00" → 11700）
 */
function parseAmount(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/,/g, '')) || 0;
}

/**
 * 解析公积金比例列为小数比例：5 → 0.05、12 → 0.12、0.05 → 0.05、"5%" → 0.05。
 * 空/非数字/负数/>100 返回 ''（视为未填，回退全局比例；≤1 视为小数写法，>1 视为百分数）
 */
function parseFundRate(raw) {
  const s = String(raw == null ? '' : raw).trim().replace(/%|％$/, '').trim();
  if (!s) return '';
  const v = parseFloat(s);
  if (!isFinite(v) || v < 0 || v > 100) return '';
  return v <= 1 ? v : v / 100;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function formatNum(n) {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 比例展示：0.12 → "12%"、0.05 → "5%" */
function formatRate(rate) {
  return (rate * 100).toFixed(1).replace(/\.0$/, '') + '%';
}

/* 文件导出：多层回退兼容不同浏览器和协议（file:// / https://） */
async function downloadFile(content, filename, type) {
  /* 文本内容加 BOM 便于 Excel 识别 UTF-8；二进制内容（如 xlsx）原样封装 */
  const isBinary = content instanceof ArrayBuffer || ArrayBuffer.isView(content) || content instanceof Blob;
  const blob = new Blob(isBinary ? [content] : ['\uFEFF' + content], { type: type + ';charset=utf-8' });

  /* 第一层：File System Access API（支持自选保存路径，仅安全上下文可用） */
  if (window.showSaveFilePicker) {
    try {
      const ext = filename.split('.').pop() || 'csv';
      const mimeMap = { csv: 'text/csv', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel' };
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: ext.toUpperCase() + ' 文件', accept: { [mimeMap[ext] || type]: ['.' + ext] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }

  /* 第二层：传统 a 标签 + MouseEvent 派发（兼容大多数 HTTPS 场景） */
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
    a.dispatchEvent(evt);
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    return;
  } catch (e) { /* 继续回退 */ }

  /* 第三层：新窗口打开内容（兼容 file:// 协议及 Safari 等严格环境；二进制无文本预览，直接提示） */
  try {
    if (isBinary) {
      alert('当前环境无法直接保存 ' + filename + '，请改用支持的浏览器（Chrome / Edge / Firefox）');
      return;
    }
    const reader = new FileReader();
    reader.onload = function () {
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(`<html><head><title>${filename}</title></head><body><pre style="font-family:monospace;font-size:13px;white-space:pre-wrap;">${content.replace(/</g, '&lt;')}</pre><script>document.addEventListener('keydown',function(e){if((e.metaKey||e.ctrlKey)&&e.key==='s'){e.preventDefault();document.execCommand('saveAs','','${filename}')}});<\/script></body></html>`);
        w.document.close();
      }
    };
    reader.readAsText(blob);
    return;
  } catch (e) { /* 继续回退 */ }

  /* 第四层：复制到剪贴板并提示 */
  try {
    await navigator.clipboard.writeText(content);
    alert('已将内容复制到剪贴板，请粘贴到文本编辑器中保存为：' + filename);
  } catch (e) {
    /* 最终兜底：弹出文本框手动复制 */
    const ta = document.createElement('textarea');
    ta.value = content;
    ta.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:80vw;height:60vh;z-index:99999;font-family:monospace;font-size:12px;';
    document.body.appendChild(ta);
    ta.select();
    alert('请按 Ctrl+C / Cmd+C 复制内容，然后粘贴到文本编辑器保存为：' + filename);
    document.body.removeChild(ta);
  }
}


  window.TaxUtils = { downloadFile,formatNum,formatRate,parseAmount,parseFundRate,round2 };
})();
