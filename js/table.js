import { fmtDate, fmtMoney, pill } from './utils.js';

export function setTableLoading() {
  document.getElementById('table-body').innerHTML = `
    <tr><td colspan="12">
      <div class="state-box"><div class="spinner"></div><p>Cargando registros…</p></div>
    </td></tr>`;
}

export function showTableError(msg) {
  document.getElementById('table-body').innerHTML = `
    <tr><td colspan="12">
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
      <tr><td colspan="12">
        <div class="state-box">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <p>No se encontraron registros.</p>
        </div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = records.map((rec, i) => `
    <tr data-idx="${i}">
      <td class="folio">${rec.folio || '—'}</td>
      <td>${rec.expediente || '—'}</td>
      <td style="max-width:180px">${rec.nombre_paciente || '—'}</td>
      <td>${rec.nivel_patologia || '—'}</td>
      <td>${fmtDate(rec.fecha_entrega)   || '—'}</td>
      <td>${fmtDate(rec.fecha_recepcion) || '—'}</td>
      <td>${pill(rec.patologia_fisica, 'Recibida', 'No recibida')}</td>
      <td>${pill(rec.requiere_cita)}</td>
      <td>${fmtDate(rec.fecha_cita) || '—'}</td>
      <td>${pill(rec.enviado_paciente, 'Enviado', 'Pendiente')}</td>
      <td>${fmtMoney(rec.monto) || '—'}</td>
      <td>${fmtDate(rec.fecha_pago) || '—'}</td>
    </tr>
  `).join('');

  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () => onRowClick(records[parseInt(tr.dataset.idx)], tr));
  });
}
