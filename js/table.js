import { fmtDateShort, fmtMoney, diasBadge, escHtml, requiereCita, resultadoEnviado, nivelTexto, etapaDe, porCobrar } from './utils.js';

const COLSPAN = 13;

/* Siguiente paso del estudio; el cobro pendiente va como marca aparte. */
function celdaEtapa(rec) {
  const e = etapaDe(rec);
  const cobro = porCobrar(rec)
    ? '<span class="etapa-cobro" title="Resultado físico recibido y sin fecha de pago">$ por cobrar</span>'
    : '';
  return `<span class="etapa etapa-${e.key}" title="${e.hint}">${e.label}</span>${cobro}`;
}

/* "Requiere cita" y "Fecha cita" en una sola celda. */
function celdaCita(rec) {
  if (!String(rec.requiere_cita || '').trim()) return '<span class="muted">—</span>';
  if (!requiereCita(rec)) return '<span class="pill pill-no">No</span>';
  const f = fmtDateShort(rec.fecha_cita);
  return `<span class="pill pill-yes">Sí</span>${f ? ` <span class="cita-fecha">${f}</span>` : ''}`;
}

/* Con cita agendada el resultado ya cuenta como enviado aunque no haya fecha de envío. */
function celdaEnvio(rec) {
  if (rec.enviado_paciente) return fmtDateShort(rec.enviado_paciente);
  if (resultadoEnviado(rec)) {
    return `<span class="pill pill-yes" title="Requiere cita y ya tiene fecha de cita (${fmtDateShort(rec.fecha_cita)}): el resultado cuenta como enviado">Vía cita</span>`;
  }
  return '<span class="muted">—</span>';
}

export function setTableLoading() {
  document.getElementById('table-body').innerHTML = `
    <tr><td colspan="${COLSPAN}">
      <div class="state-box"><div class="spinner"></div><p>Cargando registros…</p></div>
    </td></tr>`;
}

/* Estado de la tabla (vacío o error): qué pasó y, si aplica, la acción siguiente. */
function stateRow(icon, message, action) {
  document.getElementById('table-body').innerHTML = `
    <tr><td colspan="${COLSPAN}">
      <div class="state-box">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>
        <p>${message}</p>
        ${action ? `<button type="button" class="btn btn-outline state-action" id="state-action">${escHtml(action.label)}</button>` : ''}
      </div>
    </td></tr>`;
  if (action) document.getElementById('state-action').addEventListener('click', action.onClick);
}

const ICON_ERROR = '<circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>';
const ICON_EMPTY = '<path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>';

export function showTableError(msg, onRetry) {
  stateRow(ICON_ERROR, `No se pudieron cargar los registros. ${escHtml(msg)}`,
    onRetry ? { label: 'Reintentar', onClick: onRetry } : null);
}

/**
 * empty: { message, action? } — lo que se muestra cuando no hay filas
 * (búsqueda sin coincidencias, filtro vacío…). El mensaje ya viene escapado.
 */
export function renderTable(records, onRowClick, empty = { message: 'No hay registros para mostrar.' }) {
  const tbody = document.getElementById('table-body');

  if (!records.length) {
    stateRow(ICON_EMPTY, empty.message, empty.action);
    return;
  }

  const fecha = v => fmtDateShort(v) || '<span class="muted">—</span>';

  tbody.innerHTML = records.map((rec, i) => {
    const nombre = rec.nombre_paciente ? escHtml(rec.nombre_paciente) : '—';
    return `
    <tr data-idx="${i}">
      <td class="col-id"><span class="folio">${escHtml(rec.folio || '—')}</span><small>${escHtml(rec.expediente || '—')}</small></td>
      <td class="col-nombre" title="${rec.nombre_paciente ? nombre : ''}">${nombre}</td>
      <td class="col-etapa">${celdaEtapa(rec)}</td>
      <td class="col-nivel">${escHtml(nivelTexto(rec.nivel_patologia) || '—')}</td>
      <td>${fecha(rec.fecha_entrega)}</td>
      <td>${fecha(rec.fecha_recepcion)}</td>
      <td class="col-dias">${diasBadge(rec)}</td>
      <td>${fecha(rec.patologia_fisica)}</td>
      <td>${fecha(rec.fecha_revision_medico)}</td>
      <td>${celdaCita(rec)}</td>
      <td>${celdaEnvio(rec)}</td>
      <td class="col-monto">${fmtMoney(rec.monto) || '<span class="muted">—</span>'}</td>
      <td>${fecha(rec.fecha_pago)}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () => onRowClick(records[parseInt(tr.dataset.idx)], tr));
  });
}

function buildPageList(current, total) {
  const delta = 1;
  const range = [];
  for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
    range.push(i);
  }
  const pages = [1];
  if (range[0] > 2) pages.push('…');
  pages.push(...range);
  if (range[range.length - 1] < total - 1) pages.push('…');
  if (total > 1) pages.push(total);
  return pages;
}

export function renderPagination(container, { page, totalPages, onPageChange }) {
  if (totalPages <= 1) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  const pages = buildPageList(page, totalPages);

  container.innerHTML = `
    <button class="page-btn" data-page="prev" ${page === 1 ? 'disabled' : ''} aria-label="Página anterior">‹</button>
    ${pages.map(p => p === '…'
      ? `<span class="page-ellipsis">…</span>`
      : `<button class="page-btn ${p === page ? 'active' : ''}" data-page="${p}">${p}</button>`
    ).join('')}
    <button class="page-btn" data-page="next" ${page === totalPages ? 'disabled' : ''} aria-label="Página siguiente">›</button>
  `;

  container.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.page;
      if (val === 'prev') onPageChange(page - 1);
      else if (val === 'next') onPageChange(page + 1);
      else onPageChange(parseInt(val, 10));
    });
  });
}
