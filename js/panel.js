import { FIELDS } from './config.js';
import { escHtml } from './utils.js';
import { getEditableSections } from './auth.js';

let activeRow    = null;
let activeRecord = null;
let isNew        = false;

export function getActiveRecord() { return activeRecord; }
export function isNewRecord()     { return isNew; }

const LOCK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;vertical-align:middle;margin-left:5px;opacity:.6"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`;

function buildPanelBody(record, readonlyFolio = false) {
  const body = document.querySelector('#side-panel .panel-body');
  const editableSections = getEditableSections();
  let html = '<div class="fields-grid">';
  let lastSection = null;
  let sectionEditable = true;

  FIELDS.forEach(f => {
    if (f.section && f.section !== lastSection) {
      sectionEditable = editableSections.includes(f.section);
      const locked = !sectionEditable;
      html += `</div><div class="section-label${locked ? ' section-locked' : ''}">${f.section}${locked ? LOCK_ICON : ''}</div><div class="fields-grid">`;
      lastSection = f.section;
    }

    const isReadonly = (readonlyFolio && f.key === 'folio') || !sectionEditable;
    const roAttr = isReadonly ? ' readonly class="field-readonly"' : '';
    const val = record[f.key] ?? '';

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
        else if (val === 'Papanicolau') precio = '200.00';
        
        inpMonto.value = precio;
      }
    });
  }
}

export function openPanel(record, tr) {
  isNew = false;
  if (activeRow) activeRow.classList.remove('active');
  activeRow    = tr;
  activeRecord = record;
  tr.classList.add('active');

  document.getElementById('panel-title').textContent =
    record.nombre_paciente || 'Sin nombre';
  document.getElementById('panel-subtitle').textContent =
    'Folio: ' + (record.folio || '—') + ' · Exp: ' + (record.expediente || '—');
  document.getElementById('btn-save-edit').innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px"><path d="M5 13l4 4L19 7"/></svg> Guardar cambios`;

  buildPanelBody(record, true);

  document.getElementById('side-panel').classList.add('open');
  document.getElementById('app-body').classList.add('panel-open');
}

export function openNewPanel() {
  isNew = true;
  if (activeRow) activeRow.classList.remove('active');
  activeRow    = null;
  activeRecord = {};

  document.getElementById('panel-title').textContent    = 'Nuevo Registro';
  document.getElementById('panel-subtitle').textContent = 'Complete los campos y guarde';
  document.getElementById('btn-save-edit').innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px"><path d="M12 4v16m8-8H4"/></svg> Crear registro`;

  buildPanelBody({});

  document.getElementById('side-panel').classList.add('open');
  document.getElementById('app-body').classList.add('panel-open');
}

export function closePanel() {
  document.getElementById('side-panel').classList.remove('open');
  document.getElementById('app-body').classList.remove('panel-open');
  if (activeRow) { activeRow.classList.remove('active'); activeRow = null; }
  activeRecord = null;
  isNew        = false;
}

export function collectPanelValues() {
  const rec = { ...activeRecord };
  FIELDS.forEach(f => {
    const el = document.getElementById('fe-' + f.key);
    if (el && (!el.readOnly && !el.disabled || f.key === 'monto')) {
      rec[f.key] = el.value;
    }
  });
  return rec;
}
