import { FIELDS } from './config.js';
import { setStatus, showToast, normalizeRecord } from './utils.js';
import { apiFetch, apiUpdateField, apiCreateRecord } from './api.js';
import { setTableLoading, showTableError, renderTable, renderPagination } from './table.js';
import { openPanel, openNewPanel, closePanel, collectPanelValues, getActiveRecord, isNewRecord } from './panel.js';
import { canCreateRecord } from './auth.js';

const PAGE_SIZE = 15;

let allRecords   = [];
let activeFilter = null;
let currentPage  = 1;

const FILTERS = {
  'not-arrived':     r => !r.patologia_fisica,
  'pending-send':    r => Boolean(r.patologia_fisica) && !r.enviado_paciente,
  'pending-payment': r => Boolean(r.patologia_fisica) && !r.fecha_pago,
};

function applyFilter(records) {
  const fn = FILTERS[activeFilter];
  return fn ? records.filter(fn) : records;
}

function compareFolioDesc(a, b) {
  return String(b.folio ?? '').localeCompare(String(a.folio ?? ''), undefined, { numeric: true, sensitivity: 'base' });
}

function updateFilterUI() {
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.filter === activeFilter);
  });
}

function renderView() {
  const filtered    = applyFilter(allRecords).slice().sort(compareFolioDesc);
  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  currentPage       = Math.min(currentPage, totalPages);
  const start       = (currentPage - 1) * PAGE_SIZE;
  const pageItems   = filtered.slice(start, start + PAGE_SIZE);

  renderTable(pageItems, openPanel);
  renderPagination(document.getElementById('pagination'), {
    page: currentPage,
    totalPages,
    onPageChange: p => { currentPage = p; renderView(); }
  });

  document.getElementById('stats-bar').style.display = 'flex';
  document.getElementById('stat-count').textContent  = filtered.length;
}

async function loadAll() {
  setTableLoading();
  try {
    const data = await apiFetch({ action: 'getAll' });
    const rows = Array.isArray(data) ? data : (data.records || data.data || []);
    allRecords  = rows.map(normalizeRecord);
    currentPage = 1;
    renderView();
    setStatus('online', `${allRecords.length} registros`);
  } catch (e) {
    setStatus('error', 'Error de conexión');
    showTableError(e.message);
    showToast('No se pudo conectar a la API. Revisa la URL.', true);
  }
}

async function loadSearch(type, query) {
  setTableLoading();
  try {
    const data = await apiFetch({ action: 'search', type, query });
    const rows = Array.isArray(data) ? data : (data.records || data.data || []);
    allRecords  = rows.map(normalizeRecord);
    currentPage = 1;
    renderView();
    setStatus('online', `${allRecords.length} resultado(s)`);
  } catch (e) {
    setStatus('error', 'Error de conexión');
    showTableError(e.message);
    showToast('Error al buscar. Revisa la URL de la API.', true);
  }
}

async function saveRecord(original, updated) {
  setStatus('loading', 'Guardando…');
  const id = updated.id || original.id;

  const changed = FIELDS.filter(
    f => f.key !== 'id' &&
         String(updated[f.key] ?? '') !== String(original[f.key] ?? '')
  );

  if (!changed.length) {
    showToast('Sin cambios que guardar.');
    setStatus('online', 'Sin cambios');
    return;
  }

  try {
    for (const f of changed) {
      await apiUpdateField(id, f.key, updated[f.key] ?? '');
    }
    setStatus('online', 'Guardado');
    showToast(`${changed.length} campo(s) guardado(s) correctamente.`);

    const q = document.getElementById('search-input').value.trim();
    if (q) {
      const type = document.querySelector('input[name=stype]:checked').value;
      await loadSearch(type, q);
    } else {
      await loadAll();
    }
  } catch (e) {
    setStatus('error', 'Error al guardar');
    showToast(`Error al guardar: ${e.message}`, true);
    console.error('[saveRecord]', e);
  }
}

async function createRecord(data) {
  const folio = (data.folio || '').trim();
  if (!folio) {
    showToast('El Folio es obligatorio para crear un registro.', true);
    return;
  }

  setStatus('loading', 'Creando…');
  try {
    await apiCreateRecord(data);
    setStatus('online', 'Creado');
    showToast('Registro creado correctamente.');
    await loadAll();
  } catch (e) {
    setStatus('error', 'Error al crear');
    showToast(`Error al crear: ${e.message}`, true);
    console.error('[createRecord]', e);
  }
}

/* ── Event listeners ─────────────────────────────── */
document.getElementById('btn-all').addEventListener('click', loadAll);
document.getElementById('btn-new').addEventListener('click', openNewPanel);

document.getElementById('btn-search').addEventListener('click', () => {
  const q = document.getElementById('search-input').value.trim();
  if (!q) { showToast('Escribe algo para buscar.', true); return; }
  const type = document.querySelector('input[name=stype]:checked').value;
  loadSearch(type, q);
});

document.getElementById('search-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-search').click();
});

document.getElementById('btn-close-panel').addEventListener('click', closePanel);
document.getElementById('btn-cancel-edit').addEventListener('click', closePanel);

document.getElementById('btn-save-edit').addEventListener('click', () => {
  const record   = getActiveRecord();
  const creating = isNewRecord();
  if (record === null && !creating) return;
  const values = collectPanelValues();
  closePanel();
  if (creating) {
    createRecord(values);
  } else {
    saveRecord({ ...record }, values);
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closePanel();
});

document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', async () => {
    const filter = chip.dataset.filter;
    activeFilter = activeFilter === filter ? null : filter;
    updateFilterUI();
    currentPage = 1;

    if (allRecords.length === 0) {
      await loadAll();
    } else {
      renderView();
    }
  });
});

/* ── Init ────────────────────────────────────────── */
if (!canCreateRecord()) {
  document.getElementById('btn-new').style.display = 'none';
}
setStatus('', 'Listo');
