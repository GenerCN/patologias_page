import { FIELDS } from './config.js';
import { escHtml, diasRecepcion, DIAS_LIMITE } from './utils.js';
import { getEditableSections } from './auth.js';

let activeRow = null;
let activeRecord = null;
let isNew = false;
let baseline = {};          // valores del formulario al abrirlo (o tras guardarlos)
let busy = false;           // hay un guardado en curso
let pendingAction = null;   // lo que se hará si el usuario descarta los cambios

export function getActiveRecord() { return activeRecord; }
export function isNewRecord() { return isNew; }
export function isPanelOpen() { return document.getElementById('side-panel').classList.contains('open'); }
export function isPanelBusy() { return busy; }

/* Valores actuales de los campos editables, leídos del formulario. */
function formValues() {
  const vals = {};
  FIELDS.forEach(f => {
    const el = document.getElementById('fe-' + f.key);
    if (el && f.type !== 'hidden') vals[f.key] = el.value;
  });
  return vals;
}

function snapshotBaseline() { baseline = formValues(); }

/* Campos cuyo valor cambió desde que se abrió el panel (o desde el último guardado). */
export function getChangedKeys() {
  if (!isPanelOpen()) return [];
  const now = formValues();
  return Object.keys(now).filter(k => String(now[k] ?? '') !== String(baseline[k] ?? ''));
}

export function isDirty() { return getChangedKeys().length > 0; }

/* Un campo ya quedó guardado: deja de contar como cambio pendiente. */
export function markFieldSaved(key, value) {
  baseline[key] = value;
  if (activeRecord) activeRecord[key] = value;
}

export function fieldLabel(key) {
  return FIELDS.find(f => f.key === key)?.label || key;
}

/* Bloquea el panel mientras guarda; el botón muestra el progreso. */
export function setPanelBusy(on, label = '') {
  busy = on;
  const panel = document.getElementById('side-panel');
  panel.classList.toggle('is-busy', on);
  panel.querySelector('.panel-body').setAttribute('aria-busy', on ? 'true' : 'false');
  ['btn-save-edit', 'btn-cancel-edit', 'btn-close-panel'].forEach(id => {
    document.getElementById(id).disabled = on;
  });
  const save = document.getElementById('btn-save-edit');
  if (on) {
    save.dataset.label = save.dataset.label || save.innerHTML;
    save.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span>${escHtml(label)}`;
  } else if (save.dataset.label) {
    save.innerHTML = save.dataset.label;
    delete save.dataset.label;
  }
}

export function showPanelAlert(message, onRetry) {
  const box = document.getElementById('panel-alert');
  box.innerHTML = `<p>${escHtml(message)}</p>`
    + (onRetry ? '<button type="button" class="btn btn-retry" id="btn-retry-save">Reintentar</button>' : '');
  box.hidden = false;
  if (onRetry) document.getElementById('btn-retry-save').addEventListener('click', onRetry, { once: true });
}

export function clearPanelAlert() {
  const box = document.getElementById('panel-alert');
  box.hidden = true;
  box.innerHTML = '';
}

function showConfirm(show) {
  document.getElementById('panel-confirm').hidden = !show;
  document.getElementById('panel-footer').hidden = show;
  if (show) document.getElementById('btn-keep-editing').focus();
}

/**
 * Cierra el panel o cambia de registro sin perder trabajo: si hay cambios
 * sin guardar, primero pide confirmación en el pie del panel.
 */
export function requestClose(action = closePanel) {
  if (busy) return;
  if (!isPanelOpen() || !isDirty()) { action(); return; }
  pendingAction = action;
  showConfirm(true);
}

document.getElementById('btn-keep-editing').addEventListener('click', () => {
  pendingAction = null;
  showConfirm(false);
  const first = getChangedKeys()[0];
  document.getElementById('fe-' + first)?.focus();
});

document.getElementById('btn-discard-changes').addEventListener('click', () => {
  const action = pendingAction;
  pendingAction = null;
  showConfirm(false);
  if (action) action();
});

const LOCK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;vertical-align:middle;margin-left:5px;opacity:.6"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`;

function panelDias(record) {
  const r = diasRecepcion(record);
  let contenido;
  if (!r) {
    contenido = '<span class="dias dias-na">Sin fecha de entrega</span>';
  } else {
    const etiqueta = r.vencido ? 'Fuera de plazo' : 'Dentro de plazo';
    const nota = r.pendiente
      ? 'Contando hasta hoy: los resultados digitales aún no se reciben.'
      : 'Días entre la entrega y la recepción de resultados digitales.';
    contenido = `<span class="dias dias-panel ${r.vencido ? 'dias-mal' : 'dias-ok'}${r.pendiente ? ' dias-pend' : ''}">`
      + `<i aria-hidden="true"></i>${r.dias} ${r.dias === 1 ? 'día' : 'días'} · ${etiqueta}</span>`
      + `<span class="dias-panel-nota">${nota} Límite: ${DIAS_LIMITE} días.</span>`;
  }
  return `<div class="field-group full"><label>Días desde la entrega</label>${contenido}</div>`;
}

function buildPanelBody(record, readonlyFolio = false) {
  const body = document.querySelector('#side-panel .panel-body');
  const editableSections = getEditableSections();
  let html = '<div class="fields-grid">';
  let lastSection = null;
  let sectionEditable = true;

  FIELDS.forEach(f => {
    const val = record[f.key] ?? '';

    if (f.type === 'hidden') {
      html += `<input type="hidden" id="fe-${f.key}" name="${f.key}" value="${escHtml(val)}">`;
      return;
    }

    if (f.section && f.section !== lastSection) {
      sectionEditable = editableSections.includes(f.section);
      const locked = !sectionEditable;
      html += `</div><div class="section-label${locked ? ' section-locked' : ''}">${f.section}${locked ? LOCK_ICON : ''}</div><div class="fields-grid">`;
      lastSection = f.section;
    }

    const isReadonly = (readonlyFolio && f.key === 'folio') || !sectionEditable;
    const roAttr = isReadonly ? ' readonly class="field-readonly"' : '';

    html += `<div class="field-group${f.full ? ' full' : ''}">
      <label for="fe-${f.key}">${f.label}</label>`;

    if (f.type === 'select') {
      html += `<select id="fe-${f.key}" name="${f.key}"${isReadonly ? ' disabled class="field-readonly"' : ''}>`;
      f.options.forEach(o => {
        html += `<option value="${o}"${val == o ? ' selected' : ''}>${o || '— seleccionar —'}</option>`;
      });
      html += `</select>`;
    } else if (f.type === 'date') {
      let dval = '';
      if (val) { const d = new Date(val); dval = isNaN(d) ? val : d.toISOString().slice(0, 10); }
      html += `<input type="date" id="fe-${f.key}" name="${f.key}" value="${dval}"${roAttr}>`;
    } else {
      html += `<input type="text" id="fe-${f.key}" name="${f.key}" value="${escHtml(val)}"${roAttr}>`;
    }
    html += `</div>`;

    // Debajo de la recepción digital: días transcurridos desde la entrega.
    if (f.key === 'fecha_recepcion' && !isNew) html += panelDias(record);
  });

  html += '</div>';
  body.innerHTML = html;

  // Auto-completar monto según nivel de patología
  const selPatologia = document.getElementById('fe-nivel_patologia');
  if (selPatologia) {
    selPatologia.addEventListener('change', (e) => {
      const val = e.target.value;
      const inpMonto = document.getElementById('fe-monto');
      if (inpMonto) {
        let precio = '';
        if (val === '1') precio = '900.00';
        else if (val === '2') precio = '1600.00';
        else if (val === '3') precio = '2100.00';
        else if (val === '4') precio = '2500.00';
        else if (val === '5') return; // Nivel 5: no coloca el precio automáticamente
        else if (val === 'Papanicolau') precio = '200.00';

        inpMonto.value = precio;
      }
    });
  }
}

export function openPanel(record, tr) {
  isNew = false;
  if (activeRow) activeRow.classList.remove('active');
  activeRow = tr;
  activeRecord = record;
  tr.classList.add('active');

  document.getElementById('panel-title').textContent =
    record.nombre_paciente || 'Sin nombre';
  document.getElementById('panel-subtitle').textContent =
    'Folio: ' + (record.folio || '—') + ' · Exp: ' + (record.expediente || '—');
  document.getElementById('btn-save-edit').innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px"><path d="M5 13l4 4L19 7"/></svg> Guardar cambios`;

  buildPanelBody(record, true);
  resetPanelState();

  document.getElementById('side-panel').classList.add('open');
  document.getElementById('app-body').classList.add('panel-open');
}

export function openNewPanel() {
  isNew = true;
  if (activeRow) activeRow.classList.remove('active');
  activeRow = null;
  activeRecord = {};

  document.getElementById('panel-title').textContent = 'Nuevo Registro';
  document.getElementById('panel-subtitle').textContent = 'Complete los campos y guarde';
  document.getElementById('btn-save-edit').innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px"><path d="M12 4v16m8-8H4"/></svg> Crear registro`;

  buildPanelBody({});
  resetPanelState();

  document.getElementById('side-panel').classList.add('open');
  document.getElementById('app-body').classList.add('panel-open');
}

function resetPanelState() {
  clearPanelAlert();
  showConfirm(false);
  pendingAction = null;
  snapshotBaseline();
}

export function closePanel() {
  clearPanelAlert();
  showConfirm(false);
  pendingAction = null;
  baseline = {};
  document.getElementById('side-panel').classList.remove('open');
  document.getElementById('app-body').classList.remove('panel-open');
  if (activeRow) { activeRow.classList.remove('active'); activeRow = null; }
  activeRecord = null;
  isNew = false;
}

export function collectPanelValues() {
  const rec = { ...activeRecord };
  FIELDS.forEach(f => {
    const el = document.getElementById('fe-' + f.key);
    if (el && (!el.readOnly && !el.disabled || f.key === 'monto' || f.type === 'hidden')) {
      rec[f.key] = el.value;
    }
  });
  return rec;
}
