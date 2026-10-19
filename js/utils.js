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

/* Convierte el valor de la hoja en una fecha local a medianoche.
   "2026-10-12" y "12/10/2026" se arman a mano: new Date() leería el primero
   como UTC (un día antes en México) y no entiende el segundo. */
export function parseLocalDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(s);
  if (isNaN(d)) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Fecha corta para la tabla: 19/10/26. */
export function fmtDateShort(val) {
  const d = parseLocalDate(val);
  if (!d) return val ? String(val) : '';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

const SI = ['si', 'sí', 'yes', 'true', '1', 'x'];

export function requiereCita(rec) {
  return SI.includes(String(rec.requiere_cita || '').trim().toLowerCase());
}

/**
 * El resultado cuenta como enviado al paciente:
 *  - con cita: en cuanto tiene fecha de cita (o fecha de envío);
 *  - sin cita: solo con la fecha de envío a paciente.
 */
export function resultadoEnviado(rec) {
  if (rec.enviado_paciente) return true;
  return requiereCita(rec) && Boolean(rec.fecha_cita);
}

export const DIAS_LIMITE = 10;   // días naturales entre entrega y resultados digitales

/**
 * Días naturales entre la entrega y la recepción de resultados digitales.
 * Sin resultados todavía, cuenta hasta hoy (el número sigue creciendo).
 * Devuelve null si no hay fecha de entrega.
 */
export function diasRecepcion(rec) {
  const entrega = parseLocalDate(rec.fecha_entrega);
  if (!entrega) return null;
  const recibido = parseLocalDate(rec.fecha_recepcion);
  const hoy = new Date();
  const fin = recibido || new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const dias = Math.max(0, Math.round((fin - entrega) / 86400000));
  return { dias, pendiente: !recibido, vencido: dias > DIAS_LIMITE };
}

export function diasBadge(rec) {
  const r = diasRecepcion(rec);
  if (!r) return '<span class="dias dias-na" title="Sin fecha de entrega">—</span>';
  const estado = r.vencido ? 'Fuera de plazo' : 'Dentro de plazo';
  const detalle = r.pendiente
    ? `${r.dias} días desde la entrega; resultados digitales aún sin recibir`
    : `resultados digitales recibidos ${r.dias} días después de la entrega`;
  return `<span class="dias ${r.vencido ? 'dias-mal' : 'dias-ok'}${r.pendiente ? ' dias-pend' : ''}" title="${estado}: ${detalle}">`
    + `<i aria-hidden="true"></i>${r.dias} d${r.pendiente ? ' <small>en espera</small>' : ''}</span>`;
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
    // 1. Clave interna directa
    if (raw[f.key] !== undefined) { rec[f.key] = raw[f.key]; return; }
    // 2. Nombre de columna en Google Sheets según KEY_MAP
    const sheetCol = KEY_MAP[f.key];
    if (sheetCol && raw[sheetCol] !== undefined) { rec[f.key] = raw[sheetCol]; return; }
    // 3. Coincidencia por etiqueta (fallback)
    const labelMatch = Object.keys(raw).find(k =>
      k.toLowerCase().replace(/[^a-z0-9]/g, '') === f.label.toLowerCase().replace(/[^a-z0-9]/g, '')
    );
    if (labelMatch) { rec[f.key] = raw[labelMatch]; return; }
    rec[f.key] = '';
  });
  rec.__raw = raw;
  return rec;
}
