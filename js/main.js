import { FIELDS } from './config.js';
import { setStatus, showToast, normalizeRecord } from './utils.js';
import { apiFetch, apiUpdateField } from './api.js';
import { setTableLoading, showTableError, renderTable } from './table.js';
import { openPanel, closePanel, collectPanelValues, getActiveRecord } from './panel.js';

let allRecords = [];

async function loadAll() {
  setTableLoading();
  try {
    const data = await apiFetch({ action: 'getAll' });
    const rows = Array.isArray(data) ? data : (data.records || data.data || []);
    allRecords  = rows.map(normalizeRecord);
    renderTable(allRecords, openPanel);
    setStatus('online', `${allRecords.length} registros`);
    document.getElementById('stats-bar').style.display = 'flex';
    document.getElementById('stat-count').textContent  = allRecords.length;
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
    renderTable(allRecords, openPanel);
    setStatus('online', `${allRecords.length} resultado(s)`);
    document.getElementById('stats-bar').style.display = 'flex';
    document.getElementById('stat-count').textContent  = allRecords.length;
  } catch (e) {
    setStatus('error', 'Error de conexión');
    showTableError(e.message);
    showToast('Error al buscar. Revisa la URL de la API.', true);
  }
}

async function saveRecord(original, updated) {
  setStatus('loading', 'Guardando…');
  const folio = updated.folio || original.folio;

  const changed = FIELDS.filter(
    f => f.key !== 'folio' &&
         String(updated[f.key] ?? '') !== String(original[f.key] ?? '')
  );

  if (!changed.length) {
    showToast('Sin cambios que guardar.');
    setStatus('online', 'Sin cambios');
    return;
  }

  try {
    for (const f of changed) {
      await apiUpdateField(folio, f.key, updated[f.key] ?? '');
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

/* ── Event listeners ─────────────────────────────── */
document.getElementById('btn-all').addEventListener('click', loadAll);

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
  const record = getActiveRecord();
  if (!record) return;
  const original = { ...record };
  const updated  = collectPanelValues();
  closePanel();
  saveRecord(original, updated);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closePanel();
});

/* ── Init ────────────────────────────────────────── */
setStatus('', 'Listo');
