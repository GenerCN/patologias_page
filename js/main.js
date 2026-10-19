import { setStatus, showToast, normalizeRecord, resultadoEnviado } from './utils.js';
import { apiFetch, apiUpdateField, apiCreateRecord } from './api.js';
import { setTableLoading, showTableError, renderTable, renderPagination } from './table.js';
import {
  openPanel, openNewPanel, closePanel, collectPanelValues, getActiveRecord, isNewRecord,
  requestClose, isPanelOpen, isPanelBusy, isDirty, getChangedKeys, markFieldSaved, fieldLabel,
  setPanelBusy, showPanelAlert, clearPanelAlert,
} from './panel.js';
import { canCreateRecord, getSession, tieneAccesoPatologias } from './auth.js';

/* Portero del módulo. El `throw` corta la evaluación para que no se pinte
   ni se consulte nada mientras el navegador procesa la redirección. */
const session = getSession();
if (!session || !tieneAccesoPatologias(session.usuario)) {
  window.location.replace(session ? 'index.html' : 'login.html');
  throw new Error('Este usuario no tiene acceso al módulo de patologías.');
}
document.documentElement.classList.remove('pat-verificando');

const PAGE_SIZE = 30;   // registros por página; el resto se navega con la paginación

let allRecords   = [];
let activeFilter = null;
let currentPage  = 1;

const FILTERS = {
  'not-arrived':     r => !r.patologia_fisica,
  // Con cita, la fecha de cita ya cuenta como envío (ver resultadoEnviado).
  'pending-send':    r => Boolean(r.patologia_fisica) && !resultadoEnviado(r),
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

  renderTable(pageItems, abrirRegistro);
  renderPagination(document.getElementById('pagination'), {
    page: currentPage,
    totalPages,
    onPageChange: p => { currentPage = p; renderView(); }
  });

  document.getElementById('stats-bar').style.display = 'flex';
  document.getElementById('stat-count').textContent  = filtered.length;
}

/* Traduce errores técnicos a un mensaje que el personal pueda resolver. */
function mensajeError(e) {
  const msg = String(e?.message || e || '');
  if (e instanceof TypeError || /failed to fetch|networkerror|error de red|load failed/i.test(msg)) {
    return 'Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.';
  }
  const http = msg.match(/HTTP (\d{3})/);
  if (http) {
    return Number(http[1]) >= 500 || http[1] === '404'
      ? 'El servidor no respondió. Espera unos segundos e intenta de nuevo.'
      : `El servidor rechazó la solicitud (código ${http[1]}).`;
  }
  if (/JSON/i.test(msg)) return 'El servidor respondió de forma inesperada. Intenta de nuevo.';
  return msg || 'Ocurrió un error inesperado.';
}

/* keepPage: tras guardar, la tabla se queda en la página donde estaba el usuario. */
async function loadAll({ keepPage = false } = {}) {
  setTableLoading();
  try {
    const data = await apiFetch({ action: 'getAll' });
    const rows = Array.isArray(data) ? data : (data.records || data.data || []);
    allRecords  = rows.map(normalizeRecord);
    if (!keepPage) currentPage = 1;
    renderView();
    setStatus('online', `${allRecords.length} registros`);
  } catch (e) {
    setStatus('error', 'Error de conexión');
    showTableError(mensajeError(e));
    showToast('No se pudieron cargar los registros.', true);
  }
}

async function loadSearch(type, query, { keepPage = false } = {}) {
  setTableLoading();
  try {
    const data = await apiFetch({ action: 'search', type, query });
    const rows = Array.isArray(data) ? data : (data.records || data.data || []);
    allRecords  = rows.map(normalizeRecord);
    if (!keepPage) currentPage = 1;
    renderView();
    setStatus('online', `${allRecords.length} resultado(s)`);
  } catch (e) {
    setStatus('error', 'Error de conexión');
    showTableError(mensajeError(e));
    showToast('No se pudo completar la búsqueda.', true);
  }
}

function recargarVista() {
  const q = document.getElementById('search-input').value.trim();
  if (q) {
    const type = document.querySelector('input[name=stype]:checked').value;
    return loadSearch(type, q, { keepPage: true });
  }
  return loadAll({ keepPage: true });
}

/* Abrir otro registro no debe tirar los cambios del que se está editando. */
function abrirRegistro(record, tr) {
  if (isPanelOpen() && getActiveRecord() === record) return;
  requestClose(() => openPanel(record, tr));
}

/* ── Guardado ────────────────────────────────────────
   El backend guarda un campo por llamada, así que el panel se queda abierto
   hasta que TODOS los cambios llegan. Si uno falla, los ya guardados dejan de
   contar como pendientes y "Reintentar" envía solo lo que falta. */
async function saveRecord() {
  const record = getActiveRecord();
  if (!record) return;
  const values  = collectPanelValues();
  const id      = values.id || record.id;
  const changed = getChangedKeys();

  if (!changed.length) {
    closePanel();
    showToast('Sin cambios que guardar.');
    return;
  }

  clearPanelAlert();
  setStatus('loading', 'Guardando…');
  const total = changed.length;
  let hechos = 0;

  for (const key of changed) {
    setPanelBusy(true, total > 1 ? `Guardando ${hechos + 1} de ${total}…` : 'Guardando…');
    try {
      await apiUpdateField(id, key, values[key] ?? '');
      markFieldSaved(key, values[key] ?? '');
      hechos++;
    } catch (e) {
      console.error('[saveRecord]', key, e);
      setPanelBusy(false);
      setStatus('error', 'Error al guardar');
      const parcial = hechos > 0 ? `Se guardaron ${hechos} de ${total} campos. ` : '';
      showPanelAlert(
        `${parcial}No se pudo guardar «${fieldLabel(key)}»: ${mensajeError(e)} Tus datos siguen aquí.`,
        saveRecord,
      );
      return;
    }
  }

  setPanelBusy(false);
  closePanel();
  setStatus('online', 'Guardado');
  showToast(total === 1 ? 'Cambio guardado correctamente.' : `${total} cambios guardados correctamente.`);
  await recargarVista();
}

async function createRecord() {
  const data  = collectPanelValues();
  const folio = (data.folio || '').trim();
  if (!folio) {
    showPanelAlert('El folio es obligatorio para crear un registro.');
    document.getElementById('fe-folio')?.focus();
    return;
  }

  clearPanelAlert();
  setStatus('loading', 'Creando…');
  setPanelBusy(true, 'Creando registro…');
  try {
    await apiCreateRecord(data);
  } catch (e) {
    console.error('[createRecord]', e);
    setPanelBusy(false);
    setStatus('error', 'Error al crear');
    // Si se cortó la conexión, el registro pudo haberse creado de todos modos.
    showPanelAlert(
      `No se pudo confirmar la creación: ${mensajeError(e)} Antes de reintentar, revisa con «Ver todos» que el folio ${folio} no exista ya.`,
      createRecord,
    );
    return;
  }
  setPanelBusy(false);
  closePanel();
  setStatus('online', 'Creado');
  showToast('Registro creado correctamente.');
  await loadAll();
}

/* ── Event listeners ─────────────────────────────── */
document.getElementById('btn-all').addEventListener('click', () => loadAll());
document.getElementById('btn-new').addEventListener('click', () => requestClose(openNewPanel));

document.getElementById('btn-search').addEventListener('click', () => {
  const q = document.getElementById('search-input').value.trim();
  if (!q) {
    document.getElementById('search-input').focus();
    showToast('Escribe un folio, expediente o nombre para buscar.', true);
    return;
  }
  const type = document.querySelector('input[name=stype]:checked').value;
  loadSearch(type, q);
});

document.getElementById('search-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-search').click();
});

document.getElementById('btn-close-panel').addEventListener('click', () => requestClose());
document.getElementById('btn-cancel-edit').addEventListener('click', () => requestClose());

document.getElementById('btn-save-edit').addEventListener('click', () => {
  if (isPanelBusy()) return;   // evita el doble envío
  if (isNewRecord()) createRecord();
  else saveRecord();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && isPanelOpen()) requestClose();
});

/* Cerrar o recargar la pestaña con cambios pendientes también pide confirmación. */
window.addEventListener('beforeunload', e => {
  if (isPanelBusy() || isDirty()) { e.preventDefault(); e.returnValue = ''; }
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
