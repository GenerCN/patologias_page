import { fmtDateShort, fmtMoney, diasBadge, escHtml } from './utils.js';

const COLSPAN = 12;

/* "Requiere cita" y "Fecha cita" en una sola celda. */
function celdaCita(rec) {
  const v = String(rec.requiere_cita || '').trim().toLowerCase();
  if (!v) return '<span class="muted">—</span>';
  if (!['si', 'sí', 'yes', 'true', '1', 'x'].includes(v)) return '<span class="pill pill-no">No</span>';
  const f = fmtDateShort(rec.fecha_cita);
  return `<span class="pill pill-yes">Sí</span>${f ? ` <span class="cita-fecha">${f}</span>` : ''}`;
}

export function setTableLoading() {
  document.getElementById('table-body').innerHTML = `
    <tr><td colspan="${COLSPAN}">
      <div class="state-box"><div class="spinner"></div><p>Cargando registros…</p></div>
    </td></tr>`;
}

export function showTableError(msg) {
  document.getElementById('table-body').innerHTML = `
    <tr><td colspan="${COLSPAN}">
      <div class="state-box">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
        </svg>
        <p>Error: ${msg}</p>
      </div>
    </td></tr>`;
}

export function renderTable(records, onRowClick) {
  const tbody = document.getElementById('table-body');

  if (!records.length) {
    tbody.innerHTML = `
      <tr><td colspan="${COLSPAN}">
        <div class="state-box">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <p>No se encontraron registros.</p>
        </div>
      </td></tr>`;
    return;
  }

  const fecha = v => fmtDateShort(v) || '<span class="muted">—</span>';

  tbody.innerHTML = records.map((rec, i) => {
    const nombre = rec.nombre_paciente ? escHtml(rec.nombre_paciente) : '—';
    return `
    <tr data-idx="${i}">
      <td class="col-id"><span class="folio">${escHtml(rec.folio || '—')}</span><small>${escHtml(rec.expediente || '—')}</small></td>
      <td class="col-nombre" title="${rec.nombre_paciente ? nombre : ''}">${nombre}</td>
      <td class="col-nivel">${escHtml(rec.nivel_patologia || '—')}</td>
      <td>${fecha(rec.fecha_entrega)}</td>
      <td>${fecha(rec.fecha_recepcion)}</td>
      <td class="col-dias">${diasBadge(rec)}</td>
      <td>${fecha(rec.patologia_fisica)}</td>
      <td>${fecha(rec.fecha_revision_medico)}</td>
      <td>${celdaCita(rec)}</td>
      <td>${fecha(rec.enviado_paciente)}</td>
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
