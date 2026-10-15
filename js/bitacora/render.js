import { ESTADO, ALERTA, ARCHIVO, MOV_ARCHIVADO, MOV_TRANSF_CANCELADA } from './config.js';
import { escHtml } from '../utils.js';

const COLSPAN = 8;   // 7 de datos + la casilla de selección

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
  // En el archivo puede pasar años: estar quieto ahí es lo esperado.
  if (exp.estado === ESTADO.ARCHIVO || min === null) return { min, alerta: false };
  const umbral = exp.estado === ESTADO.TRANSITO ? ALERTA.TRANSITO : ALERTA.ESTANCIA;
  return { min, alerta: min >= umbral };
}

function badgeEstado(exp) {
  if (exp.estado === ESTADO.ARCHIVO) {
    return '<span class="bit-badge bit-badge-archivo">En archivo</span>';
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
  if (exp.estado === ESTADO.ARCHIVO) {
    return `<span class="bit-depto bit-depto-archivo">${escHtml(ARCHIVO)}</span>`;
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

export function renderTabla(expedientes, ahora, onRowClick, seleccion = null, onToggleSel = null) {
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
    const marcada = seleccion ? seleccion.has(exp.expediente) : false;
    return `
    <tr data-idx="${i}"${alerta ? ' class="bit-row-alerta"' : ''}>
      <td class="bit-col-sel">
        <input type="checkbox" class="bit-chk-fila" data-exp="${escHtml(exp.expediente)}"
               aria-label="Seleccionar expediente ${escHtml(exp.expediente)}"${marcada ? ' checked' : ''}>
      </td>
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
    tr.addEventListener('click', e => {
      // Marcar la casilla no debe abrir el panel del expediente.
      if (e.target.closest('.bit-col-sel')) return;
      onRowClick(expedientes[parseInt(tr.dataset.idx, 10)], tr);
    });
  });

  if (onToggleSel) {
    tbody.querySelectorAll('.bit-chk-fila').forEach(chk => {
      chk.addEventListener('change', () => onToggleSel(chk.dataset.exp, chk.checked));
    });
  }
}

/* ── Línea de tiempo del expediente ───────────────────────────────────── */

/** El paso Admisión → Archivo: sin traslado ni acuse, solo cuánto lleva guardado. */
function pasoArchivo(mov, ahora, esUltimo) {
  const cancelado = mov.estado === 'Cancelado';
  let tiempo = mov.minutos_estancia;
  let enCurso = false;
  if (!cancelado && tiempo === null && esUltimo) {
    tiempo = minutosDesde(mov.fecha_recepcion, ahora);
    enCurso = true;
  }

  return `
    <li class="bit-paso bit-paso-archivo${cancelado ? ' bit-paso-cancelado' : ''}">
      <div class="bit-paso-punto"></div>
      <div class="bit-paso-cuerpo">
        <div class="bit-paso-titulo">
          Guardado en el archivo
          ${cancelado ? '<span class="bit-badge bit-badge-cancelado">Cancelado</span>' : ''}
        </div>
        <div class="bit-paso-linea">
          <span class="bit-paso-etiqueta">Archivó</span>
          ${escHtml(mov.usuario_entrega || '—')} · ${fmtFechaHora(mov.fecha_entrega)}
        </div>
        ${cancelado ? '' : `
        <div class="bit-paso-tiempos">
          <span class="bit-tiempo">
            <strong>En archivo:</strong> ${fmtDuracion(tiempo)}${enCurso ? ' (sigue ahí)' : ''}
          </span>
        </div>`}
        ${mov.observaciones ? `<div class="bit-paso-obs">${escHtml(mov.observaciones)}</div>` : ''}
      </div>
    </li>`;
}

/**
 * Envío que Admisión anuló antes del acuse. Sí ocurrió, así que no se tacha:
 * muestra el motivo, cuánto alcanzó a estar en tránsito y cuánto lleva o
 * llevó de vuelta en Admisión.
 */
function pasoTransfCancelada(mov, ahora, esUltimo) {
  let estancia = mov.minutos_estancia;
  let enCurso = false;
  if (estancia === null && esUltimo) {
    estancia = minutosDesde(mov.fecha_recepcion, ahora);
    enCurso = true;
  }

  return `
    <li class="bit-paso bit-paso-transf-cancelada">
      <div class="bit-paso-punto"></div>
      <div class="bit-paso-cuerpo">
        <div class="bit-paso-titulo">
          ${escHtml(mov.origen)} <span class="bit-flecha">→</span> ${escHtml(mov.destino)}
          <span class="bit-badge bit-badge-cancelado">Transferencia cancelada</span>
        </div>
        <div class="bit-paso-motivo">${escHtml(mov.motivo_cancelacion || 'Sin motivo registrado')}</div>

        <div class="bit-paso-linea">
          <span class="bit-paso-etiqueta">Entregó</span>
          ${escHtml(mov.usuario_entrega || '—')} · ${fmtFechaHora(mov.fecha_entrega)}
        </div>
        <div class="bit-paso-linea">
          <span class="bit-paso-etiqueta">Canceló</span>
          ${escHtml(mov.usuario_recepcion || '—')} · ${fmtFechaHora(mov.fecha_recepcion)}
        </div>

        <div class="bit-paso-tiempos">
          <span class="bit-tiempo">
            <strong>En tránsito:</strong> ${fmtDuracion(mov.minutos_traslado)}
          </span>
          <span class="bit-tiempo">
            <strong>De vuelta en Admisión:</strong> ${fmtDuracion(estancia)}${enCurso ? ' (en curso)' : ''}
          </span>
        </div>

        ${mov.observaciones ? `<div class="bit-paso-obs">${escHtml(mov.observaciones)}</div>` : ''}
      </div>
    </li>`;
}

/** Alta que se quedó en Admisión: sin traslado ni acuse, solo cuánto estuvo ahí. */
function pasoAltaEnAdmision(mov, ahora, esUltimo) {
  let estancia = mov.minutos_estancia;
  let enCurso = false;
  if (estancia === null && esUltimo) {
    estancia = minutosDesde(mov.fecha_recepcion, ahora);
    enCurso = true;
  }
  const alerta = enCurso && estancia >= ALERTA.ESTANCIA;

  return `
    <li class="bit-paso bit-paso-ok">
      <div class="bit-paso-punto"></div>
      <div class="bit-paso-cuerpo">
        <div class="bit-paso-titulo">Registrado en Admisión</div>
        <div class="bit-paso-linea">
          <span class="bit-paso-etiqueta">Registró</span>
          ${escHtml(mov.usuario_entrega || '—')} · ${fmtFechaHora(mov.fecha_entrega)}
        </div>
        <div class="bit-paso-tiempos">
          <span class="bit-tiempo${alerta ? ' bit-tiempo-alerta' : ''}">
            <strong>En Admisión:</strong> ${fmtDuracion(estancia)}${enCurso ? ' (en curso)' : ''}
          </span>
        </div>
        ${mov.observaciones ? `<div class="bit-paso-obs">${escHtml(mov.observaciones)}</div>` : ''}
      </div>
    </li>`;
}

function pasoTimeline(mov, exp, ahora, esUltimo) {
  // Origen = destino solo ocurre en un alta que se quedó en Admisión.
  if (mov.origen === mov.destino && mov.estado !== 'Cancelado') {
    return pasoAltaEnAdmision(mov, ahora, esUltimo);
  }
  if (mov.estado === MOV_ARCHIVADO || (mov.estado === 'Cancelado' && mov.destino === ARCHIVO)) {
    return pasoArchivo(mov, ahora, esUltimo);
  }
  if (mov.estado === MOV_TRANSF_CANCELADA) {
    return pasoTransfCancelada(mov, ahora, esUltimo);
  }

  const cancelado = mov.estado === 'Cancelado';
  const recibido  = Boolean(mov.fecha_recepcion);

  /* La estancia guardada solo existe cuando el expediente ya salió de ahí.
     Si el último paso sigue abierto se calcula contra el reloj actual. Con
     el archivo como paso propio, el último movimiento vivo siempre es una
     estancia en curso: en un departamento o en el archivo. */
  let estancia = mov.minutos_estancia;
  let estanciaEnCurso = false;
  if (!cancelado && recibido && estancia === null && esUltimo) {
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

/**
 * Suma total por departamento, para el resumen del panel. El tiempo en
 * archivo se devuelve aparte: no es un departamento y, al medirse en meses,
 * aplastaría las barras de los departamentos hasta volverlas ilegibles.
 */
function resumenPorDepto(movimientos, exp, ahora) {
  const acum = new Map();
  let enArchivo = 0;
  const vivos = movimientos.filter(m => m.estado !== 'Cancelado');

  vivos.forEach((mov, i) => {
    if (!mov.fecha_recepcion) return;
    let min = mov.minutos_estancia;
    if (min === null) {
      if (i !== vivos.length - 1) return;
      min = minutosDesde(mov.fecha_recepcion, ahora);
    }
    if (mov.destino === ARCHIVO) { enArchivo += Number(min || 0); return; }
    // Tras cancelar el envío, la estancia que sigue es en Admisión, no en el destino.
    const lugar = mov.estado === MOV_TRANSF_CANCELADA ? 'Admisión' : mov.destino;
    acum.set(lugar, (acum.get(lugar) || 0) + Number(min || 0));
  });

  return { deptos: [...acum.entries()].sort((a, b) => b[1] - a[1]), enArchivo };
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

  const { deptos: resumen, enArchivo } = resumenPorDepto(movimientos, exp, ahora);
  const totalMin = resumen.reduce((s, [, m]) => s + m, 0);

  /* Un expediente archivado por la versión anterior, si no se corrió la
     migración, no tiene paso de archivo en su historial. Se muestra la
     fecha de archivo para que el recorrido no parezca quedar a medias. */
  const sinPasoArchivo = exp.estado === ESTADO.ARCHIVO &&
    (!ultimoVivo || ultimoVivo.estado !== MOV_ARCHIVADO);
  const filaArchivoLegado = sinPasoArchivo ? `
    <li class="bit-paso bit-paso-archivo">
      <div class="bit-paso-punto"></div>
      <div class="bit-paso-cuerpo">
        <div class="bit-paso-titulo">Guardado en el archivo</div>
        <div class="bit-paso-linea">${fmtFechaHora(exp.fecha_cierre)}</div>
      </div>
    </li>` : '';

  return `
    <div class="section-label">Tiempo acumulado por departamento</div>
    <div class="bit-resumen">
      ${enArchivo ? `
        <div class="bit-resumen-archivo">
          Tiempo total en archivo: <strong>${fmtDuracion(enArchivo)}</strong>
        </div>` : ''}
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
    <ul class="bit-timeline">${pasos}${filaArchivoLegado}</ul>`;
}
