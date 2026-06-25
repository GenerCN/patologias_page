import { FIELDS, KEY_MAP } from './config.js';

export function setStatus(state, label) {
  document.getElementById('conn-dot').className    = 'dot ' + state;
  document.getElementById('conn-label').textContent = label;
}

export function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show' + (isError ? ' error' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = ''; }, 3000);
}

export function fmtDate(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d)) return val;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtMoney(val) {
  if (val === '' || val === null || val === undefined) return '';
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  if (isNaN(n)) return val;
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 });
}

export function pill(val, trueLabel, falseLabel) {
  if (!val || String(val).trim() === '') return '<span class="pill pill-no">—</span>';
  const v   = String(val).toLowerCase();
  const yes = ['si', 'sí', 'yes', 'true', '1', 'x'];
  if (yes.includes(v)) return `<span class="pill pill-yes">${trueLabel || 'Sí'}</span>`;
  return `<span class="pill pill-no">${falseLabel || 'No'}</span>`;
}

export function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function normalizeRecord(raw) {
  const rec = {};
  FIELDS.forEach(f => {
    if (raw[f.key] !== undefined) { rec[f.key] = raw[f.key]; return; }
    const alias = Object.keys(KEY_MAP).find(k => KEY_MAP[k] === f.key);
    if (alias && raw[alias] !== undefined) { rec[f.key] = raw[alias]; return; }
    const labelMatch = Object.keys(raw).find(k =>
      k.toLowerCase().replace(/[^a-z0-9]/g, '') === f.label.toLowerCase().replace(/[^a-z0-9]/g, '')
    );
    if (labelMatch) { rec[f.key] = raw[labelMatch]; return; }
    rec[f.key] = '';
  });
  rec.__raw = raw;
  return rec;
}
