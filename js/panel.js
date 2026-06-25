import { FIELDS } from './config.js';
import { escHtml } from './utils.js';

let activeRow    = null;
let activeRecord = null;

export function getActiveRecord() { return activeRecord; }

export function openPanel(record, tr) {
  if (activeRow) activeRow.classList.remove('active');
  activeRow    = tr;
  activeRecord = record;
  tr.classList.add('active');

  document.getElementById('panel-title').textContent =
    record.nombre_paciente || 'Sin nombre';
  document.getElementById('panel-subtitle').textContent =
    'Folio: ' + (record.folio || '—') + ' · Exp: ' + (record.expediente || '—');

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

  document.getElementById('side-panel').classList.add('open');
  document.getElementById('app-body').classList.add('panel-open');
}

export function closePanel() {
  document.getElementById('side-panel').classList.remove('open');
  document.getElementById('app-body').classList.remove('panel-open');
  if (activeRow) { activeRow.classList.remove('active'); activeRow = null; }
  activeRecord = null;
}

export function collectPanelValues() {
  const rec = { ...activeRecord };
  FIELDS.forEach(f => {
    const el = document.getElementById('fe-' + f.key);
    if (el) rec[f.key] = el.value;
  });
  return rec;
}
