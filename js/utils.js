import { FIELDS, KEY_MAP, LABEL_ALIASES } from './config.js';

/** Texto visible del nivel; corrige la ortografía sin tocar el valor guardado. */
export function nivelTexto(v) {
  return v === 'Papanicolau' ? 'Papanicolaou' : v;
}

/** "1 resultado" / "7 resultados" */
export function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

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

/* Etapas del estudio, en orden. El cobro corre por separado (ver porCobrar):
   puede hacerse en cualquier momento después del resultado físico. */
export const ETAPAS = [
  { key: 'sin-entrega', label: 'Sin entrega',    hint: 'Falta registrar la fecha de entrega' },
  { key: 'digital',     label: 'Espera digital', hint: 'Esperando resultado digital del laboratorio' },
  { key: 'fisico',      label: 'Espera físico',  hint: 'Resultado digital recibido; falta el físico' },
  { key: 'revision',    label: 'Por revisar',    hint: 'Falta la revisión del médico' },
  { key: 'envio',       label: 'Por enviar',     hint: 'Revisado; falta enviarlo al paciente o agendar cita' },
  { key: 'completo',    label: 'Completo',       hint: 'Resultado enviado al paciente (o con cita agendada)' },
];

export function etapaDe(rec) {
  const key = !rec.fecha_entrega          ? 'sin-entrega'
            : !rec.fecha_recepcion        ? 'digital'
            : !rec.patologia_fisica       ? 'fisico'
            : !rec.fecha_revision_medico  ? 'revision'
            : !resultadoEnviado(rec)      ? 'envio'
            : 'completo';
  return ETAPAS.find(e => e.key === key);
}

/** Igual que el filtro "Pendientes de pago": resultado físico recibido y sin fecha de pago. */
export function porCobrar(rec) {
  return Boolean(rec.patologia_fisica) && !rec.fecha_pago;
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

/* El rojo fuerte se reserva para lo único accionable: pendiente y fuera de plazo.
   Cada estado lleva además ícono y texto, para no depender solo del color. */
const ICONO_DIAS = {
  vencido: '<path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17v.01"/>',
  espera:  '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  ok:      '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  tarde:   '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
};

/** Uno de: 'vencido' | 'espera' | 'ok' | 'tarde' (null sin fecha de entrega). */
export function estadoDias(r) {
  if (!r) return null;
  if (r.pendiente) return r.vencido ? 'vencido' : 'espera';
  return r.vencido ? 'tarde' : 'ok';
}

export function textoEstadoDias(r) {
  const d = `${r.dias} ${r.dias === 1 ? 'día' : 'días'}`;
  switch (estadoDias(r)) {
    case 'vencido': return `Vencido: ${d} sin resultado digital (límite ${DIAS_LIMITE})`;
    case 'espera':  return `En espera: ${d} desde la entrega, dentro del plazo`;
    case 'tarde':   return `Recibido fuera de plazo: ${d} después de la entrega`;
    default:        return `Recibido a tiempo: ${d} después de la entrega`;
  }
}

export function iconoDias(estado) {
  return `<svg class="dias-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONO_DIAS[estado]}</svg>`;
}

export function diasBadge(rec) {
  const r = diasRecepcion(rec);
  if (!r) return '<span class="dias dias-na">—<span class="sr-only">Sin fecha de entrega</span></span>';
  const estado = estadoDias(r);
  const extra = estado === 'vencido' ? ' · vencido' : estado === 'espera' ? ' · en espera' : '';
  const texto = textoEstadoDias(r);
  return `<span class="dias dias-${estado}" title="${texto}">${iconoDias(estado)}`
    + `<span aria-hidden="true">${r.dias} d${extra}</span><span class="sr-only">${texto}</span></span>`;
}

export function fmtMoney(val) {
  if (val === '' || val === null || val === undefined) return '';
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  if (isNaN(n)) return val;
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 });
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
    // 3. Coincidencia por etiqueta, actual o anterior (fallback)
    const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const candidatos = [f.label, LABEL_ALIASES[f.key]].filter(Boolean).map(norm);
    const labelMatch = Object.keys(raw).find(k => candidatos.includes(norm(k)));
    if (labelMatch) { rec[f.key] = raw[labelMatch]; return; }
    rec[f.key] = '';
  });
  rec.__raw = raw;
  return rec;
}
