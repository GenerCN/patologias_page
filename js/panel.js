import { FIELDS } from './config.js';
import { escHtml } from './utils.js';

let activeRow    = null;
let activeRecord = null;
let isNew        = false;

export function getActiveRecord() { return activeRecord; }
export function isNewRecord()     { return isNew; }

function buildPanelBody(record) {
  const body = document.querySelector('#side-panel .panel-body');
  let html = '<div class="fields-grid">';
  let lastSection = null;

  FIELDS.forEach(f => {
    if (f.section && f.section !== lastSection) {
      html += `</div><div class="section-label">${f.section}</div><div class="fields-grid">`;
      lastSection = f.section;
    }
    html += `<div class="field-group${f.full ? ' full' : ''}">
      <label for="fe-${f.key}">${f.label}</label>`;

    const val = record[f.key] ?? '';

    if (f.type === 'select') {
      html += `<select id="fe-${f.key}" name="${f.key}">`;
      f.options.forEach(o => {
        html += `<option value="${o}"${val == o ? ' selected' : ''}>${o || '— seleccionar —'}</option>`;
      });
      html += `</select>`;
    } else if (f.type === 'date') {
      let dval = '';
      if (val) {
        const d = new Date(val);
        dval = isNaN(d) ? val : d.toISOString().slice(0, 10);
      }
      html += `<input type="date" id="fe-${f.key}" name="${f.key}" value="${dval}">`;
    } else {
      html += `<input type="text" id="fe-${f.key}" name="${f.key}" value="${escHtml(val)}">`;
    }
    html += `</div>`;
  });

  html += '</div>';
  body.innerHTML = html;
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

  buildPanelBody(record);

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
    if (el) rec[f.key] = el.value;
  });
  return rec;
}
