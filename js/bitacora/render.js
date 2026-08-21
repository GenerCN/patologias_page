import { ESTADO, ALERTA } from './config.js';
import { escHtml } from '../utils.js';

const COLSPAN = 7;

/* ── Formateo ─────────────────────────────────────────────────────────── */

export function fmtFechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  // Reloj de 24 h: en un hospital "14:30" es menos ambiguo que "2:30 p.m."
  return d.toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/** Convierte minutos en "2 d 4 h" / "3 h 20 min" / "45 min". */
export function fmtDuracion(min) {
  if (min === null || min === undefined || min === '' || isNaN(min)) return '—';
  const m = Math.max(0, Math.round(Number(min)));
  if (m < 1) return 'menos de 1 min';
  if (m < 60) return `${m} min`;
  const horas = Math.floor(m / 60);
  if (horas < 24) {
    const resto = m % 60;
    return resto ? `${horas} h ${resto} min` : `${horas} h`;
  }
  const dias = Math.floor(horas / 24);
  const restoH = horas % 24;
  return restoH ? `${dias} d ${restoH} h` : `${dias} d`;
}

/** Minutos transcurridos entre un ISO y ahora (o el reloj del servidor). */
export function minutosDesde(iso, ahora) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  const ref = ahora ? new Date(ahora).getTime() : Date.now();
  return Math.max(0, Math.round((ref - t) / 60000));
}

/* ── Estado del expediente ────────────────────────────────────────────── */

/** Minutos que el expediente lleva sin moverse y si eso ya es alarma. */
export function estadoDeAlerta(exp, ahora) {
  const min = minutosDesde(exp.ultima_act, ahora);
  if (exp.estado === ESTADO.CERRADO || min === null) return { min, alerta: false };
  const umbral = exp.estado === ESTADO.TRANSITO ? ALERTA.TRANSITO : ALERTA.ESTANCIA;
  return { min, alerta: min >= umbral };
}

function badgeEstado(exp) {
  if (exp.estado === ESTADO.CERRADO) {
    return '<span class="bit-badge bit-badge-cerrado">Cerrado</span>';
  }
  if (exp.estado === ESTADO.TRANSITO) {
    return '<span class="bit-badge bit-badge-transito">En tránsito</span>';
  }
  return '<span class="bit-badge bit-badge-activo">En departamento</span>';
}

function celdaUbicacion(exp) {
  if (exp.estado === ESTADO.TRANSITO) {
    return `<span class="bit-ruta">
      <span class="bit-depto bit-depto-origen">${escHtml(exp.departamento_actual || '—')}</span>
      <span class="bit-flecha">→</span>
      <span class="bit-depto bit-depto-destino">${escHtml(exp.destino_pendiente || '—')}</span>
    </span>`;
  }
  return `<span class="bit-depto">${escHtml(exp.departamento_actual || '—')}</span>`;
}

/* ── Tabla ────────────────────────────────────────────────────────────── */

export function setTablaCargando() {
  document.getElementById('table-body').innerHTML = `
    <tr><td colspan="${COLSPAN}">
      <div class="state-box"><div class="spinner"></div><p>Cargando expedientes…</p></div>
    </td></tr>`;
}

export function mostrarErrorTabla(msg) {
  document.getElementById('table-body').innerHTML = `
    <tr><td colspan="${COLSPAN}">
      <div class="state-box">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
        </svg>
        <p>Error: ${escHtml(msg)}</p>
      </div>
    </td></tr>`;
}

export function renderTabla(expedientes, ahora, onRowClick) {
  const tbody = document.getElementById('table-body');

  if (!expedientes.length) {
    tbody.innerHTML = `
      <tr><td colspan="${COLSPAN}">
        <div class="state-box">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <p>No hay expedientes que mostrar.</p>
        </div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = expedientes.map((exp, i) => {
    const { min, alerta } = estadoDeAlerta(exp, ahora);
    return `
    <tr data-idx="${i}"${alerta ? ' class="bit-row-alerta"' : ''}>
      <td class="folio">${escHtml(exp.expediente || '—')}</td>
      <td style="max-width:200px">${escHtml(exp.nombre_paciente || '—')}</td>
      <td>${celdaUbicacion(exp)}</td>
      <td>${badgeEstado(exp)}</td>
      <td class="${alerta ? 'bit-tiempo-alerta' : ''}">
        ${alerta ? '<span class="bit-alerta-icono" title="Lleva demasiado tiempo sin moverse">⚠</span> ' : ''}${fmtDuracion(min)}
      </td>
      <td style="text-align:center">${exp.total_movimientos || 0}</td>
      <td>${fmtFechaHora(exp.ultima_act)}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () =>
      onRowClick(expedientes[parseInt(tr.dataset.idx, 10)], tr));
  });
}

/* ── Línea de tiempo del expediente ───────────────────────────────────── */

function pasoTimeline(mov, exp, ahora, esUltimo) {
  const cancelado = mov.estado === 'Cancelado';
  const recibido  = Boolean(mov.fecha_recepcion);

  // La estancia guardada solo existe cuando el expediente ya salió de ahí.
  // Si sigue en ese departamento se calcula contra el reloj actual.
  let estancia = mov.minutos_estancia;
  let estanciaEnCurso = false;
  if (!cancelado && recibido && estancia === null && esUltimo && exp.estado !== ESTADO.CERRADO) {
    estancia = minutosDesde(mov.fecha_recepcion, ahora);
    estanciaEnCurso = true;
  }

  let traslado = mov.minutos_traslado;
  let trasladoEnCurso = false;
  if (!cancelado && !recibido) {
    traslado = minutosDesde(mov.fecha_entrega, ahora);
    trasladoEnCurso = true;
  }

  let clase = 'bit-paso';
  if (cancelado)        clase += ' bit-paso-cancelado';
  else if (!recibido)   clase += ' bit-paso-transito';
  else                  clase += ' bit-paso-ok';

  const trasladoAlerta = trasladoEnCurso && traslado >= ALERTA.TRANSITO;
  const estanciaAlerta = estanciaEnCurso && estancia >= ALERTA.ESTANCIA;

  return `
    <li class="${clase}">
      <div class="bit-paso-punto"></div>
      <div class="bit-paso-cuerpo">
        <div class="bit-paso-titulo">
          ${escHtml(mov.origen)} <span class="bit-flecha">→</span> ${escHtml(mov.destino)}
          ${cancelado ? '<span class="bit-badge bit-badge-cancelado">Cancelado</span>' : ''}
        </div>

        <div class="bit-paso-linea">
          <span class="bit-paso-etiqueta">Entregó</span>
          ${escHtml(mov.usuario_entrega || '—')} · ${fmtFechaHora(mov.fecha_entrega)}
        </div>

        ${recibido ? `
        <div class="bit-paso-linea">
          <span class="bit-paso-etiqueta">Recibió</span>
          ${escHtml(mov.usuario_recepcion || '—')} · ${fmtFechaHora(mov.fecha_recepcion)}
        </div>` : (cancelado ? '' : `
        <div class="bit-paso-linea bit-paso-pendiente">
          <span class="bit-paso-etiqueta">Recibió</span>
          Sin acuse de recibo — nadie ha confirmado que llegó
        </div>`)}

        ${cancelado ? '' : `
        <div class="bit-paso-tiempos">
          <span class="bit-tiempo${trasladoAlerta ? ' bit-tiempo-alerta' : ''}">
            <strong>Traslado:</strong> ${fmtDuracion(traslado)}${trasladoEnCurso ? ' (en curso)' : ''}
          </span>
          <span class="bit-tiempo${estanciaAlerta ? ' bit-tiempo-alerta' : ''}">
            <strong>En ${escHtml(mov.destino)}:</strong> ${
              recibido ? fmtDuracion(estancia) + (estanciaEnCurso ? ' (en curso)' : '') : '—'
            }
          </span>
        </div>`}

        ${mov.observaciones ? `<div class="bit-paso-obs">${escHtml(mov.observaciones)}</div>` : ''}
      </div>
    </li>`;
}

/** Suma total por departamento, para el resumen del panel. */
function resumenPorDepto(movimientos, exp, ahora) {
  const acum = new Map();
  const vivos = movimientos.filter(m => m.estado !== 'Cancelado');

  vivos.forEach((mov, i) => {
    if (!mov.fecha_recepcion) return;
    let min = mov.minutos_estancia;
    if (min === null) {
      const esUltimo = i === vivos.length - 1;
      if (!esUltimo || exp.estado === ESTADO.CERRADO) return;
      min = minutosDesde(mov.fecha_recepcion, ahora);
    }
    acum.set(mov.destino, (acum.get(mov.destino) || 0) + Number(min || 0));
  });

  return [...acum.entries()].sort((a, b) => b[1] - a[1]);
}

export function renderTimeline(exp, movimientos, ahora) {
  if (!movimientos.length) {
    return `<div class="bit-vacio">Este expediente todavía no tiene movimientos registrados.</div>`;
  }

  const vivos = movimientos.filter(m => m.estado !== 'Cancelado');
  const ultimoVivo = vivos.length ? vivos[vivos.length - 1] : null;

  const pasos = movimientos.map(mov =>
    pasoTimeline(mov, exp, ahora, ultimoVivo !== null && mov.id === ultimoVivo.id)
  ).join('');

  const resumen = resumenPorDepto(movimientos, exp, ahora);
  const totalMin = resumen.reduce((s, [, m]) => s + m, 0);

  const filaCierre = exp.estado === ESTADO.CERRADO ? `
    <li class="bit-paso bit-paso-cierre">
      <div class="bit-paso-punto"></div>
      <div class="bit-paso-cuerpo">
        <div class="bit-paso-titulo">Expediente cerrado en Admisión</div>
        <div class="bit-paso-linea">${fmtFechaHora(exp.fecha_cierre)}</div>
      </div>
    </li>` : '';

  return `
    <div class="section-label">Tiempo acumulado por departamento</div>
    <div class="bit-resumen">
      ${resumen.length
        ? resumen.map(([depto, min]) => `
            <div class="bit-resumen-fila">
              <span class="bit-resumen-depto">${escHtml(depto)}</span>
              <span class="bit-resumen-barra">
                <i style="width:${totalMin ? Math.max(3, (min / totalMin) * 100) : 0}%"></i>
              </span>
              <span class="bit-resumen-min">${fmtDuracion(min)}</span>
            </div>`).join('')
        : '<div class="bit-vacio">Aún no hay estancias completadas.</div>'}
    </div>

    <div class="section-label">Recorrido del expediente</div>
    <ul class="bit-timeline">${pasos}${filaCierre}</ul>`;
}
