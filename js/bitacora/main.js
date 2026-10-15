import { requireAuth, logout } from '../auth.js';
import { setStatus, showToast, escHtml } from '../utils.js';
import { renderPagination } from '../table.js';
import {
  DEPARTAMENTOS, ESTADO, ALERTA, AUTO_REFRESCO, ARCHIVO, MOTIVOS_CANCELACION,
  deptoDe, tieneAccesoBitacora,
  puedeAperturar, puedeEntregar, puedeRecibir, puedeArchivar, puedeSacarDeArchivo, puedeDeshacer,
  puedeCancelarTransferencia, destinosDesde,
} from './config.js';
import * as api from './api.js';
import {
  renderTabla, renderTimeline, setTablaCargando, mostrarErrorTabla,
  fmtDuracion, fmtFechaHora, minutosDesde, estadoDeAlerta,
} from './render.js';

/** Opciones de destino para una salida desde Admisión. */
function opcionesSalidaAdmision() {
  return DEPARTAMENTOS
    .filter(d => d !== 'Admisión')
    .map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`)
    .join('');
}

/* Formulario de cancelación, compartido por el panel de un expediente y el
   de varios. Los motivos son botones de opción, no una lista desplegable,
   para que ambos queden a la vista al elegir cancelar. */
function formCancelacion({ obsInicial = '', etiqueta = 'Confirmar cancelación' } = {}) {
  return `
    <fieldset class="bit-motivos">
      <legend>Motivo de la cancelación *</legend>
      ${MOTIVOS_CANCELACION.map(m => `
        <label class="bit-motivo">
          <input type="radio" name="bit-motivo" value="${escHtml(m)}"> ${escHtml(m)}
        </label>`).join('')}
    </fieldset>
    <div class="field-group">
      <label for="bit-obs-cancelar">Observaciones (opcional)</label>
      <input type="text" id="bit-obs-cancelar" value="${escHtml(obsInicial)}"
             placeholder="Ej. paciente con fiebre, se reprograma">
    </div>
    <button class="btn btn-peligro" id="bit-btn-cancelar" disabled>${escHtml(etiqueta)}</button>`;
}

/** Habilita el botón solo cuando hay motivo y devuelve cómo leer lo capturado. */
function conectarFormCancelacion() {
  const boton = document.getElementById('bit-btn-cancelar');
  document.querySelectorAll('input[name="bit-motivo"]').forEach(r =>
    r.addEventListener('change', () => { boton.disabled = false; }));
  return {
    boton,
    leer: () => ({
      motivo: (document.querySelector('input[name="bit-motivo"]:checked') || {}).value || '',
      observaciones: document.getElementById('bit-obs-cancelar').value.trim(),
    }),
  };
}

/* Al registrar, Admisión decide si el expediente sale ya o se queda con
   ella. Sin opción preseleccionada a propósito: con una por defecto se
   terminarían mandando expedientes a Preoperatorio sin que nadie lo decidiera. */
function formDestinoAlta(prefijo) {
  return `
    <fieldset class="bit-opciones-alta">
      <legend>¿Qué hacer con el expediente? *</legend>
      <label class="bit-opcion">
        <input type="radio" name="${prefijo}-modo" value="transferir"> Transferir a otro departamento
      </label>
      <div class="bit-opcion-destino" id="${prefijo}-destino-wrap" hidden>
        <select id="${prefijo}-destino" aria-label="Departamento destino">${opcionesSalidaAdmision()}</select>
      </div>
      <label class="bit-opcion">
        <input type="radio" name="${prefijo}-modo" value="quedar"> Dejar en Admisión
      </label>
    </fieldset>`;
}

/**
 * Muestra el selector de departamento solo al elegir transferir y avisa del
 * cambio de opción. Devuelve una función que da el destino elegido
 * ('Admisión' si se queda) o null si todavía no se elige nada.
 */
function conectarDestinoAlta(prefijo, alCambiar) {
  const wrap   = document.getElementById(`${prefijo}-destino-wrap`);
  const select = document.getElementById(`${prefijo}-destino`);
  const radios = document.querySelectorAll(`input[name="${prefijo}-modo"]`);

  radios.forEach(r => r.addEventListener('change', () => {
    wrap.hidden = r.value !== 'transferir';
    if (r.value === 'transferir') select.focus();
    alCambiar(r.value);
  }));

  return () => {
    const elegido = [...radios].find(r => r.checked);
    if (!elegido) return null;
    return elegido.value === 'quedar' ? 'Admisión' : select.value;
  };
}

const ETIQUETA_ALTA = {
  transferir: 'Registrar y transferir',
  quedar:     'Registrar en Admisión',
};

const PAGE_SIZE = 30;  // registros por página; el resto se navega con la paginación

const session = requireAuth();
const usuario = session ? session.usuario : '';

/* Portero del módulo. El `throw` corta la evaluación del módulo para que no
   se alcance a pintar nada mientras el navegador procesa la redirección;
   la página arranca oculta y solo se destapa unas líneas más abajo. */
if (!session || !tieneAccesoBitacora(usuario)) {
  if (session) window.location.replace('index.html');
  throw new Error('Este usuario no tiene acceso al módulo de bitácora.');
}
document.documentElement.classList.remove('bit-verificando');

const miDepto = deptoDe(usuario);

let expedientes    = [];
let relojServidor  = null;   // hora del servidor al momento de la última carga
let filtroActivo   = null;
let filtroDepto    = '';
let incluirArchivo = false;
let paginaActual   = 1;
let expActivo      = null;   // expediente abierto en el panel
let filaActiva     = null;

/* Qué se está mostrando, para que el refresco automático repita la misma
   consulta y no le borre la búsqueda al usuario cada 45 segundos. */
let vistaActual   = { tipo: 'todos' };
let autoRefresco  = AUTO_REFRESCO.ACTIVO_POR_DEFECTO;
let temporizador  = null;
let guardando     = false;   // hay una escritura en curso
let ultimaSync    = null;    // Date.now() de la última carga exitosa

/** Números de expediente marcados con casilla, para operar en lote. */
const seleccion = new Set();

/* Llegadas detectadas con la pestaña oculta. El aviso emergente dura unos
   segundos y nadie lo vería, así que se guardan y se muestran al volver; el
   título de la pestaña lleva una marca mientras haya alguna sin ver. */
const llegadasSinVer   = new Map();   // expediente -> registro
const canceladasSinVer = new Map();   // envíos hacia mí que Admisión canceló

const TITULO_BASE = document.title;

const FILTROS = {
  'transito': exp => exp.estado === ESTADO.TRANSITO,
  'detenidos': exp => {
    const { alerta } = estadoDeAlerta(exp, relojServidor);
    return alerta;
  },
  /* Admisión es la custodia del archivo (solo ella mete y saca), así que
     para Admisión la ubicación "Archivo" cuenta como suya. Eso cubre dos
     casos: lo guardado, y lo que acaba de sacar y va en camino a otro
     departamento esperando acuse — igual que cuando manda uno nuevo.
     Los archivados solo llegan a la lista si se marca "Incluir expedientes
     en archivo", así que la lista de trabajo no se llena de años de archivo. */
  'mios': exp =>
    exp.departamento_actual === miDepto ||
    (exp.estado === ESTADO.TRANSITO && exp.destino_pendiente === miDepto) ||
    (miDepto === 'Admisión' && exp.departamento_actual === ARCHIVO),
};

/* ── Render de la vista ───────────────────────────────────────────────── */

function aplicarFiltros(lista) {
  let out = lista;
  const fn = FILTROS[filtroActivo];
  if (fn) out = out.filter(fn);
  if (filtroDepto) {
    out = out.filter(exp =>
      exp.departamento_actual === filtroDepto || exp.destino_pendiente === filtroDepto);
  }
  return out;
}

/** Primero lo más urgente: en tránsito, luego lo más tiempo sin moverse. */
function ordenar(a, b) {
  const rango = exp => (exp.estado === ESTADO.TRANSITO ? 0 : exp.estado === ESTADO.DEPTO ? 1 : 2);
  const ra = rango(a), rb = rango(b);
  if (ra !== rb) return ra - rb;
  return String(a.ultima_act || '').localeCompare(String(b.ultima_act || ''));
}

function actualizarChips() {
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.filter === filtroActivo);
  });
}

function actualizarStats(visibles) {
  const enTransito = expedientes.filter(e => e.estado === ESTADO.TRANSITO).length;
  const detenidos  = expedientes.filter(e => estadoDeAlerta(e, relojServidor).alerta).length;
  const mios = miDepto ? expedientes.filter(FILTROS.mios).length : null;

  document.getElementById('stats-bar').style.display = 'flex';
  document.getElementById('stat-visibles').textContent  = visibles;
  document.getElementById('stat-transito').textContent  = enTransito;
  document.getElementById('stat-detenidos').textContent = detenidos;

  const chipMios = document.getElementById('stat-chip-mios');
  if (mios === null) {
    chipMios.style.display = 'none';
  } else {
    chipMios.style.display = '';
    document.getElementById('stat-mios').textContent = mios;
    document.getElementById('stat-mi-depto').textContent = miDepto;
  }
}

/** Cuántos expedientes esperan que MI departamento acuse recibo. */
function pendientesDeRecibir() {
  if (!miDepto) return 0;
  return expedientes.filter(e =>
    e.estado === ESTADO.TRANSITO && e.destino_pendiente === miDepto).length;
}

/* El contador va en el título para que se vea desde una pestaña en segundo
   plano, que es donde la bitácora va a estar la mayor parte del turno. */
function actualizarTitulo() {
  const n = pendientesDeRecibir();
  // "●" = te llegó (o te cancelaron) algo desde la última vez que viste la pestaña.
  const nuevo = llegadasSinVer.size || canceladasSinVer.size ? '● ' : '';
  document.title = nuevo + (n ? `(${n}) ` : '') + TITULO_BASE;
}

function renderVista() {
  const filtrados  = aplicarFiltros(expedientes).slice().sort(ordenar);
  const totalPags  = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  paginaActual     = Math.min(paginaActual, totalPags);
  const inicio     = (paginaActual - 1) * PAGE_SIZE;
  const pagina     = filtrados.slice(inicio, inicio + PAGE_SIZE);

  /* Un expediente que salió de la vista (se cerró, cambió el filtro, se buscó
     otra cosa) no puede seguir seleccionado: la barra de lote diría que va a
     operar sobre algo que el usuario ya no está viendo. */
  const visibles = new Set(expedientes.map(e => e.expediente));
  [...seleccion].forEach(k => { if (!visibles.has(k)) seleccion.delete(k); });

  renderTabla(pagina, relojServidor, abrirExpediente, seleccion, toggleSeleccion);
  renderPagination(document.getElementById('pagination'), {
    page: paginaActual,
    totalPages: totalPags,
    onPageChange: p => { paginaActual = p; renderVista(); },
  });

  /* renderTabla reconstruye el <tbody>, así que la fila resaltada se pierde.
     Se vuelve a marcar para que un refresco automático no desligue
     visualmente el panel abierto de su renglón. */
  filaActiva = null;
  if (expActivo) {
    const i = pagina.findIndex(e => e.expediente === expActivo.expediente);
    if (i >= 0) {
      filaActiva = document.querySelector(`#table-body tr[data-idx="${i}"]`);
      if (filaActiva) filaActiva.classList.add('active');
    }
  }

  actualizarStats(filtrados.length);
  actualizarTitulo();
  pintarBarraLote(pagina);
}

/* ── Selección múltiple ───────────────────────────────────────────────── */

function toggleSeleccion(clave, marcada) {
  if (marcada) seleccion.add(clave);
  else seleccion.delete(clave);
  pintarBarraLote();
}

function seleccionados() {
  return expedientes.filter(e => seleccion.has(e.expediente));
}

/**
 * Pinta la barra de lote. Cada botón muestra sobre cuántos de los
 * seleccionados aplica realmente: al mezclar expedientes en distinto estado
 * es normal que una acción sirva solo para algunos, y esconder ese número
 * haría que el usuario creyera que movió más de lo que movió.
 */
function pintarBarraLote(pagina) {
  const barra = document.getElementById('bit-lote');
  const sel = seleccionados();

  if (pagina) {
    const chkTodos = document.getElementById('chk-todos');
    const marcables = pagina.length;
    const marcados = pagina.filter(e => seleccion.has(e.expediente)).length;
    chkTodos.checked = marcables > 0 && marcados === marcables;
    chkTodos.indeterminate = marcados > 0 && marcados < marcables;
  }

  if (!sel.length) { barra.style.display = 'none'; return; }
  barra.style.display = '';
  document.getElementById('bit-lote-count').textContent = sel.length;

  const entregables = sel.filter(e => puedeEntregar(usuario, e));
  const recibibles  = sel.filter(e => puedeRecibir(usuario, e));
  const archivables = sel.filter(e => puedeArchivar(usuario, e));
  const cancelables = sel.filter(e => puedeCancelarTransferencia(usuario, e));

  const marcar = (id, lista, etiqueta) => {
    const btn = document.getElementById(id);
    btn.textContent = `${etiqueta} (${lista.length})`;
    btn.disabled = lista.length === 0;
  };
  marcar('bit-lote-entregar', entregables, 'Entregar');
  marcar('bit-lote-recibir',  recibibles,  'Confirmar recepción');
  marcar('bit-lote-archivar', archivables, 'Archivar');
  marcar('bit-lote-cancelar', cancelables, 'Cancelar transferencia');

  /* Si todo lo entregable está en el mismo departamento se ofrece el
     siguiente paso habitual primero; si está repartido, la lista completa. */
  const deptos = [...new Set(entregables.map(e => e.departamento_actual))];
  const select = document.getElementById('bit-lote-destino');
  const previo = select.value;

  let html;
  if (deptos.length === 1) {
    const { sugeridos, resto } = destinosDesde(deptos[0]);
    html =
      (sugeridos.length ? `<optgroup label="Siguiente paso habitual">${
        sugeridos.map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('')}</optgroup>` : '') +
      (resto.length ? `<optgroup label="Otros departamentos">${
        resto.map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('')}</optgroup>` : '');
  } else {
    html = DEPARTAMENTOS.map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('');
  }

  if (select.innerHTML !== html) {
    select.innerHTML = html;
    if (previo && [...select.options].some(o => o.value === previo)) select.value = previo;
  }
  select.disabled = entregables.length === 0;
}

function limpiarSeleccion() {
  seleccion.clear();
  document.getElementById('bit-lote-obs').value = '';
  renderVista();
}

/** Muestra en el panel el detalle de un lote con rechazos. */
function mostrarResultadoLote(res) {
  cerrarPanel();
  document.getElementById('panel-title').textContent = 'Resultado de la operación';
  document.getElementById('panel-subtitle').textContent =
    `${res.procesados.length} procesado(s) · ${res.fallidos.length} sin procesar`;

  document.querySelector('#side-panel .panel-body').innerHTML = `
    ${res.procesados.length ? `
      <div class="section-label">Se movieron (${res.procesados.length})</div>
      <div class="bit-lote-lista">${
        res.procesados.map(c => `<span class="bit-badge bit-badge-activo">${escHtml(c)}</span>`).join('')
      }</div>` : ''}

    <div class="section-label">No se pudieron mover (${res.fallidos.length})</div>
    <ul class="bit-fallidos">
      ${res.fallidos.map(f => `
        <li>
          <strong>${escHtml(f.expediente)}</strong>
          <span>${escHtml(f.motivo)}</span>
        </li>`).join('')}
    </ul>
    <p class="bit-nota">
      Los expedientes que sí se movieron quedaron registrados; no se revierten
      porque esos papeles realmente cambiaron de lugar.
    </p>`;

  document.getElementById('side-panel').classList.add('open');
  document.getElementById('app-body').classList.add('panel-open');
}

/** Panel para cancelar de golpe varias transferencias con el mismo motivo. */
function abrirCancelarLote() {
  const lista = seleccionados().filter(x => puedeCancelarTransferencia(usuario, x));
  if (!lista.length) return;

  cerrarPanel();
  document.getElementById('panel-title').textContent = 'Cancelar transferencias';
  document.getElementById('panel-subtitle').textContent =
    `${lista.length} expediente(s) en tránsito sin acuse`;

  document.querySelector('#side-panel .panel-body').innerHTML = `
    <div class="bit-accion bit-accion-cancelar">
      <p class="bit-accion-texto">
        Se cancelará el envío de estos expedientes y regresarán a Admisión.
        El motivo se aplica a todos.
      </p>
      <div class="bit-lote-lista">${lista.map(e => `
        <span class="bit-badge bit-badge-transito"
              title="${escHtml(e.nombre_paciente)}">${escHtml(e.expediente)} → ${escHtml(e.destino_pendiente)}</span>`).join('')}
      </div>
      <div class="bit-cancelar-form">
        ${formCancelacion({ obsInicial: obsLote(), etiqueta: `Cancelar ${lista.length} transferencia(s)` })}
      </div>
    </div>`;

  document.getElementById('side-panel').classList.add('open');
  document.getElementById('app-body').classList.add('panel-open');

  const { boton, leer } = conectarFormCancelacion();
  boton.addEventListener('click', async () => {
    const { motivo, observaciones } = leer();
    if (!motivo) { showToast('Elige el motivo de la cancelación.', true); return; }
    const claves = lista.map(e => e.expediente);
    const res = await ejecutarLote(boton, claves, () =>
      api.cancelarTransferenciaLote({ expedientes: claves, motivo, usuario, observaciones }));
    // Con rechazos el panel ya muestra el detalle; sin ellos no queda nada que ver.
    if (res && !res.fallidos.length) cerrarPanel();
  });
}

/** Corre una acción en lote y reporta el resultado. Devuelve la respuesta, o null si falló. */
async function ejecutarLote(boton, claves, fn) {
  if (!claves.length) return null;

  const etiqueta = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  setStatus('loading', `Procesando ${claves.length} expediente(s)…`);
  guardando = true;

  try {
    const res = await fn();
    setStatus('online', 'Guardado');
    showToast(res.mensaje, res.fallidos.length > 0);

    // Solo se desmarca lo que sí se procesó; lo rechazado sigue seleccionado.
    res.procesados.forEach(c => seleccion.delete(c));
    if (!res.fallidos.length) document.getElementById('bit-lote-obs').value = '';

    await cargar();
    if (res.fallidos.length) mostrarResultadoLote(res);
    return res;
  } catch (e) {
    setStatus('error', 'Error al guardar');
    showToast(e.message, true);
    return null;
  } finally {
    guardando = false;
    boton.disabled = false;
    boton.textContent = etiqueta;
  }
}

/* ── Carga de datos ───────────────────────────────────────────────────── */

function traerDatos() {
  return vistaActual.tipo === 'busqueda'
    ? api.buscarExpedientes(vistaActual.type, vistaActual.query)
    : api.getExpedientes({ incluirArchivo });
}

/**
 * Trae los datos de la vista actual.
 * En modo silencioso (refresco automático) no muestra spinner, no regresa a
 * la página 1 y no rompe la tabla si falla: la red intermitente no debe
 * borrar lo que el usuario está viendo.
 */
async function cargar({ silencioso = false } = {}) {
  if (!silencioso) {
    setTablaCargando();
    setStatus('loading', vistaActual.tipo === 'busqueda' ? 'Buscando…' : 'Conectando…');
  }

  try {
    const previos = expedientes;
    const { records, servidor } = await traerDatos();

    expedientes   = records;
    relojServidor = servidor;
    ultimaSync    = Date.now();
    if (!silencioso) paginaActual = 1;

    renderVista();
    pintarSync();
    setStatus('online', vistaActual.tipo === 'busqueda'
      ? `${records.length} resultado(s)`
      : `${records.length} expediente(s)`);

    if (silencioso) avisarLlegadas(previos, records);
  } catch (e) {
    if (silencioso) {
      // Se reintenta en el siguiente ciclo; no se toca la tabla.
      setStatus('error', 'Sin conexión — se reintentará');
      pintarSync();
    } else {
      setStatus('error', 'Error de conexión');
      mostrarErrorTabla(e.message);
      showToast('No se pudo cargar la bitácora: ' + e.message, true);
    }
  }
}

function buscar(type, query) {
  vistaActual = { tipo: 'busqueda', type, query };
  return cargar();
}

function verTodos() {
  vistaActual = { tipo: 'todos' };
  return cargar();
}

/* ── Refresco automático ──────────────────────────────────────────────── */

/** Firma del estado visible de un expediente: cambia cuando se mueve. */
function firma(exp) {
  return [exp.estado, exp.departamento_actual, exp.destino_pendiente, exp.ultima_act].join('|');
}

function mensajeLlegadas(lista) {
  const uno = lista[0];
  return lista.length === 1
    ? `${uno.departamento_actual} te envió el expediente ${uno.expediente} — ${uno.nombre_paciente}`
    : `Te enviaron ${lista.length} expedientes. Confirma su recepción.`;
}

/* Quien esperaba el expediente debe enterarse de que ya no va: si el papel
   alcanzó a llegarle sin acuse, tiene que devolverlo a Admisión. */
function mensajeCanceladas(lista) {
  const uno = lista[0];
  return lista.length === 1
    ? `Admisión canceló el envío del expediente ${uno.expediente} — ${uno.nombre_paciente}. ` +
      'Si ya lo tienes, devuélvelo a Admisión.'
    : `Admisión canceló ${lista.length} envíos a ${miDepto}. Si ya los tienes, devuélvelos.`;
}

/** Avisa cuando alguien acaba de mandarle (o cancelarle) un expediente a mi departamento. */
function avisarLlegadas(previos, nuevos) {
  if (!miDepto) return;

  const antes = new Map(previos.map(e => [e.expediente, e]));
  const llegando = nuevos.filter(e =>
    e.estado === ESTADO.TRANSITO &&
    e.destino_pendiente === miDepto &&
    (!antes.has(e.expediente) || firma(antes.get(e.expediente)) !== firma(e)));

  // Venía hacia mí sin acuse y ahora está de vuelta en Admisión.
  const cancelados = miDepto === 'Admisión' ? [] : nuevos.filter(e => {
    const previo = antes.get(e.expediente);
    return previo && previo.estado === ESTADO.TRANSITO && previo.destino_pendiente === miDepto &&
           e.estado === ESTADO.DEPTO && e.departamento_actual === 'Admisión';
  });

  if (!llegando.length && !cancelados.length) return;

  if (document.visibilityState !== 'visible') {
    llegando.forEach(e => llegadasSinVer.set(e.expediente, e));
    cancelados.forEach(e => { llegadasSinVer.delete(e.expediente); canceladasSinVer.set(e.expediente, e); });
    actualizarTitulo();
    return;
  }
  // Un solo aviso: dos seguidos se pisarían en el mismo recuadro.
  showToast([
    llegando.length ? mensajeLlegadas(llegando) : '',
    cancelados.length ? mensajeCanceladas(cancelados) : '',
  ].filter(Boolean).join(' · '));
}

/** Al volver a la pestaña: muestra lo que llegó o se canceló mientras no se veía. */
function mostrarLlegadasSinVer() {
  if (!llegadasSinVer.size && !canceladasSinVer.size) return;
  // Solo las que siguen esperando acuse; alguien pudo recibirlas ya.
  const vigentes = [...llegadasSinVer.values()].filter(e => expedientes.some(x =>
    x.expediente === e.expediente && x.estado === ESTADO.TRANSITO && x.destino_pendiente === miDepto));
  const canceladas = [...canceladasSinVer.values()];
  llegadasSinVer.clear();
  canceladasSinVer.clear();
  actualizarTitulo();

  const msg = [
    vigentes.length ? mensajeLlegadas(vigentes) : '',
    canceladas.length ? mensajeCanceladas(canceladas) : '',
  ].filter(Boolean).join(' · ');
  if (msg) showToast(msg);
}

function pintarSync() {
  const el = document.getElementById('bit-sync');
  if (!el) return;

  if (!autoRefresco) { el.textContent = 'Actualización automática en pausa'; return; }
  if (!ultimaSync)   { el.textContent = 'Sin actualizar todavía';            return; }

  const seg = Math.round((Date.now() - ultimaSync) / 1000);
  el.textContent = seg < 10
    ? 'Actualizado ahora'
    : `Actualizado hace ${seg < 60 ? seg + ' s' : Math.round(seg / 60) + ' min'}`;
}

/* setTimeout encadenado en vez de setInterval: si Apps Script tarda (los
   arranques en frío pasan de 5 s) las llamadas no se encaballan. El ritmo se
   decide en cada vuelta según si la pestaña está a la vista o no. */
function programarRefresco() {
  clearTimeout(temporizador);
  if (!autoRefresco) return;

  const oculta = document.visibilityState !== 'visible';
  const segundos = oculta ? AUTO_REFRESCO.SEGUNDOS_OCULTA : AUTO_REFRESCO.SEGUNDOS;

  temporizador = setTimeout(async () => {
    // Guardando: no se pisa la escritura; se intenta en la siguiente vuelta.
    if (!guardando) await cargar({ silencioso: true });
    programarRefresco();
  }, segundos * 1000);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  mostrarLlegadasSinVer();
  if (!autoRefresco || guardando) return;

  /* Alternar pestañas dispara este evento en ráfaga; sin este freno cada
     clic en la barra de tareas sería una llamada más a Apps Script. Solo se
     consulta si los datos ya tienen media vuelta de antigüedad. Aunque no se
     consulte, se reprograma: el temporizador pendiente pudo quedar al ritmo
     lento de segundo plano y hay que volver al de pestaña activa. */
  const antiguedad = ultimaSync ? Date.now() - ultimaSync : Infinity;
  if (antiguedad < AUTO_REFRESCO.SEGUNDOS * 500) { programarRefresco(); return; }

  // Al volver a la pestaña, ponerse al día sin esperar el siguiente ciclo.
  cargar({ silencioso: true });
  programarRefresco();
});

/* ── Panel: expediente existente ──────────────────────────────────────── */

function bloqueAcciones(exp) {
  const acciones = [];

  if (puedeRecibir(usuario, exp)) {
    const minTransito = minutosDesde(exp.ultima_act, relojServidor);
    // El superusuario acusa recibo a nombre de otro departamento.
    const aNombreDeOtro = deptoDe(usuario) !== exp.destino_pendiente;
    acciones.push(`
      <div class="bit-accion bit-accion-recibir">
        <p class="bit-accion-texto">
          <strong>${escHtml(exp.departamento_actual)}</strong> lo entregó hace
          ${fmtDuracion(minTransito)} y ${escHtml(exp.destino_pendiente)} aún no acusa recibo.
          ${aNombreDeOtro
            ? `Confirma la recepción a nombre de <strong>${escHtml(exp.destino_pendiente)}</strong>.`
            : 'Confirma que ya lo tienes físicamente.'}
        </p>
        <div class="field-group">
          <label for="bit-obs-recibir">Observaciones (opcional)</label>
          <input type="text" id="bit-obs-recibir" placeholder="Ej. llegó incompleto, falta hoja de consentimiento">
        </div>
        <button class="btn btn-new" id="bit-btn-recibir">Confirmar recepción</button>
      </div>`);
  }

  /* Los motivos se despliegan al elegir cancelar: así no se cancela de un
     clic por accidente y el motivo nunca queda en blanco. */
  if (puedeCancelarTransferencia(usuario, exp)) {
    acciones.push(`
      <div class="bit-accion bit-accion-cancelar">
        <p class="bit-accion-texto">
          Va en camino a <strong>${escHtml(exp.destino_pendiente)}</strong>, que aún no acusa recibo.
          Si se canceló la cirugía o la consulta, cancela la transferencia y el
          expediente regresa a Admisión.
        </p>
        <button class="btn btn-peligro-outline" id="bit-btn-cancelar-abrir">Cancelar transferencia</button>
        <div id="bit-cancelar-form" class="bit-cancelar-form" hidden>
          ${formCancelacion()}
          <button type="button" class="bit-cancelar-volver" id="bit-btn-cancelar-volver">No cancelar</button>
        </div>
      </div>`);
  }

  if (puedeEntregar(usuario, exp)) {
    const { sugeridos, resto } = destinosDesde(exp.departamento_actual);
    const opciones =
      (sugeridos.length
        ? `<optgroup label="Siguiente paso habitual">${
            sugeridos.map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('')
          }</optgroup>`
        : '') +
      (resto.length
        ? `<optgroup label="Otros departamentos">${
            resto.map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('')
          }</optgroup>`
        : '');

    acciones.push(`
      <div class="bit-accion">
        <p class="bit-accion-texto">
          El expediente está en <strong>${escHtml(exp.departamento_actual)}</strong>.
          Registra a qué departamento lo entregas.
        </p>
        <div class="field-group">
          <label for="bit-destino">Entregar a</label>
          <select id="bit-destino">${opciones}</select>
        </div>
        <div class="field-group">
          <label for="bit-obs-entregar">Observaciones (opcional)</label>
          <input type="text" id="bit-obs-entregar" placeholder="Ej. se entrega en mano a la enfermera de turno">
        </div>
        <button class="btn btn-primary" id="bit-btn-entregar">Registrar entrega</button>
      </div>`);
  }

  /* Sacar del archivo. Se puede dejar en Admisión (consulta, trámite) o
     mandarlo directo a un departamento. En ambos casos abre un ciclo nuevo
     sin recapturar nada. */
  if (puedeSacarDeArchivo(usuario, exp)) {
    acciones.push(`
      <div class="bit-accion bit-accion-archivo">
        <p class="bit-accion-texto">
          Guardado en el archivo desde el ${fmtFechaHora(exp.fecha_cierre)}.
          Al sacarlo se abre el <strong>ciclo ${exp.ciclo + 1}</strong>
          conservando todo el historial anterior.
        </p>
        <div class="field-group">
          <label for="bit-re-destino">Sacar del archivo y…</label>
          <select id="bit-re-destino">
            <option value="Admisión">Dejarlo en Admisión</option>
            <optgroup label="Entregarlo directamente a">${opcionesSalidaAdmision()}</optgroup>
          </select>
        </div>
        <div class="field-group">
          <label for="bit-obs-reabrir">Observaciones (opcional)</label>
          <input type="text" id="bit-obs-reabrir" placeholder="Ej. paciente regresa a revisión post-operatoria">
        </div>
        <button class="btn btn-new" id="bit-btn-reabrir">Sacar del archivo</button>
      </div>`);
  }

  if (puedeArchivar(usuario, exp)) {
    acciones.push(`
      <div class="bit-accion">
        <p class="bit-accion-texto">
          El expediente ya regresó a Admisión. Guárdalo en el archivo para terminar el ciclo;
          deja de estar en cualquier departamento hasta que Admisión lo saque.
        </p>
        <div class="field-group">
          <label for="bit-obs-archivar">Observaciones (opcional)</label>
          <input type="text" id="bit-obs-archivar" placeholder="Ej. expediente completo, anaquel 4">
        </div>
        <button class="btn btn-outline" id="bit-btn-archivar">Guardar en el archivo</button>
      </div>`);
  }

  if (!acciones.length) {
    let motivo;
    if (exp.estado === ESTADO.ARCHIVO) {
      motivo = 'Este expediente está guardado en el archivo. Solo Admisión puede sacarlo.';
    } else if (exp.estado === ESTADO.TRANSITO) {
      motivo = `El expediente va en camino a <strong>${escHtml(exp.destino_pendiente)}</strong>. ` +
               'Ese departamento debe confirmar la recepción.';
    } else {
      motivo = `El expediente está en <strong>${escHtml(exp.departamento_actual)}</strong>. ` +
               'Solo ese departamento puede moverlo.';
    }
    acciones.push(`<div class="bit-aviso">${motivo}</div>`);
  }

  if (puedeDeshacer(usuario) && exp.total_movimientos > 0) {
    acciones.push(`
      <button class="bit-deshacer" id="bit-btn-deshacer">
        Deshacer el último paso registrado
      </button>`);
  }

  return acciones.join('');
}

function conectarAcciones(exp) {
  const btnRecibir = document.getElementById('bit-btn-recibir');
  if (btnRecibir) {
    btnRecibir.addEventListener('click', () => ejecutar(btnRecibir, () =>
      api.recibir({
        expediente: exp.expediente,
        usuario,
        observaciones: document.getElementById('bit-obs-recibir').value.trim(),
      })));
  }

  const btnEntregar = document.getElementById('bit-btn-entregar');
  if (btnEntregar) {
    btnEntregar.addEventListener('click', () => ejecutar(btnEntregar, () =>
      api.entregar({
        expediente: exp.expediente,
        destino: document.getElementById('bit-destino').value,
        usuario,
        observaciones: document.getElementById('bit-obs-entregar').value.trim(),
      })));
  }

  const btnReabrir = document.getElementById('bit-btn-reabrir');
  if (btnReabrir) {
    btnReabrir.addEventListener('click', () => ejecutar(btnReabrir, () =>
      api.aperturar({
        expediente: exp.expediente,
        nombre: exp.nombre_paciente,   // el backend conserva el guardado
        destino: document.getElementById('bit-re-destino').value,
        usuario,
        observaciones: document.getElementById('bit-obs-reabrir').value.trim(),
      })));
  }

  const btnArchivar = document.getElementById('bit-btn-archivar');
  if (btnArchivar) {
    btnArchivar.addEventListener('click', () => ejecutar(btnArchivar, () =>
      api.archivar({
        expediente: exp.expediente,
        usuario,
        observaciones: document.getElementById('bit-obs-archivar').value.trim(),
      })));
  }

  const btnCancelarAbrir = document.getElementById('bit-btn-cancelar-abrir');
  if (btnCancelarAbrir) {
    const form = document.getElementById('bit-cancelar-form');
    const { boton, leer } = conectarFormCancelacion();

    btnCancelarAbrir.addEventListener('click', () => {
      btnCancelarAbrir.hidden = true;
      form.hidden = false;
      form.querySelector('input[name="bit-motivo"]').focus();
    });
    document.getElementById('bit-btn-cancelar-volver').addEventListener('click', () => {
      form.hidden = true;
      btnCancelarAbrir.hidden = false;
    });

    boton.addEventListener('click', () => {
      const { motivo, observaciones } = leer();
      if (!motivo) { showToast('Elige el motivo de la cancelación.', true); return; }
      ejecutar(boton, () => api.cancelarTransferencia({
        expediente: exp.expediente, motivo, usuario, observaciones,
      }));
    });
  }

  const btnDeshacer = document.getElementById('bit-btn-deshacer');
  if (btnDeshacer) {
    btnDeshacer.addEventListener('click', () => {
      const ok = confirm(
        `¿Deshacer el último paso del expediente ${exp.expediente}?\n\n` +
        'Esto revierte el registro más reciente (recepción, entrega, cancelación de transferencia, ' +
        'archivo o salida del archivo). ' +
        'La acción queda marcada en la hoja de cálculo.');
      if (!ok) return;
      ejecutar(btnDeshacer, () => api.deshacer({ expediente: exp.expediente, usuario }));
    });
  }
}

/** Ejecuta una acción de escritura, refresca y deja el panel abierto. */
async function ejecutar(boton, fn) {
  const etiqueta = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  setStatus('loading', 'Guardando…');
  guardando = true;

  const expediente = expActivo ? expActivo.expediente : null;

  try {
    const res = await fn();
    showToast(res.mensaje || 'Movimiento registrado.');
    setStatus('online', 'Guardado');
    await cargar();
    const actualizado = expedientes.find(e => e.expediente === expediente);
    if (actualizado) abrirExpediente(actualizado, null);
    else cerrarPanel();
  } catch (e) {
    boton.disabled = false;
    boton.textContent = etiqueta;
    setStatus('error', 'Error al guardar');
    showToast(e.message, true);
  } finally {
    guardando = false;
  }
}

async function abrirExpediente(exp, tr) {
  if (filaActiva) filaActiva.classList.remove('active');
  filaActiva = tr || null;
  if (tr) tr.classList.add('active');
  expActivo = exp;

  document.getElementById('panel-title').textContent = exp.nombre_paciente || 'Sin nombre';
  document.getElementById('panel-subtitle').textContent =
    `Exp: ${exp.expediente} · ${exp.estado}` + (exp.ciclo > 1 ? ` · ciclo ${exp.ciclo}` : '');

  const body = document.querySelector('#side-panel .panel-body');
  body.innerHTML = bloqueAcciones(exp) +
    '<div id="bit-timeline-slot"><div class="state-box"><div class="spinner"></div></div></div>';

  document.getElementById('side-panel').classList.add('open');
  document.getElementById('app-body').classList.add('panel-open');

  conectarAcciones(exp);

  try {
    const movimientos = await api.getMovimientos(exp.expediente);
    const slot = document.getElementById('bit-timeline-slot');
    if (slot && expActivo && expActivo.expediente === exp.expediente) {
      slot.innerHTML = renderTimeline(exp, movimientos, relojServidor);
    }
  } catch (e) {
    const slot = document.getElementById('bit-timeline-slot');
    if (slot) slot.innerHTML = `<div class="bit-aviso">No se pudo cargar el historial: ${escHtml(e.message)}</div>`;
  }
}

/* ── Panel: nueva salida (Admisión) ───────────────────────────────────── */

/**
 * Consulta si el expediente ya existe y completa el nombre desde el registro
 * guardado. Se comparte entre la captura de uno y la de varios.
 *
 * Devuelve el estado para que quien llama decida si habilitar el botón:
 *   'nuevo' | 'reapertura' | 'activo' | 'vacio' | 'error'
 */
function vincularAutocompletado(inpExp, inpNombre, aviso, alCambiar) {
  let ultimaClave = null;
  let autocompletado = false;

  async function consultar() {
    const clave = inpExp.value.trim();
    if (clave === ultimaClave) return;
    ultimaClave = clave;

    inpNombre.readOnly = false;
    inpNombre.classList.remove('field-readonly');
    if (aviso) { aviso.style.display = 'none'; aviso.className = 'bit-aviso'; }

    /* Si el nombre lo puso el autocompletado de otro expediente hay que
       borrarlo: dejarlo ahí es cómo se termina guardando a un paciente con
       el nombre de otro. Un nombre tecleado a mano sí se respeta. */
    if (autocompletado) { inpNombre.value = ''; autocompletado = false; }

    if (!clave) { alCambiar('vacio', null); return; }

    if (aviso) {
      aviso.style.display = '';
      aviso.textContent = 'Verificando si el expediente ya existe…';
    }

    let res;
    try {
      res = await api.consultar(clave);
    } catch (e) {
      if (aviso) {
        aviso.textContent = 'No se pudo verificar: ' + e.message +
                            ' Puedes continuar; se validará al guardar.';
      }
      alCambiar('error', null);
      return;
    }

    // El usuario pudo seguir escribiendo mientras respondía el servidor.
    if (inpExp.value.trim() !== clave) return;

    if (!res.encontrado) {
      if (aviso) aviso.style.display = 'none';
      alCambiar('nuevo', null);
      return;
    }

    const prev = res.expediente;
    inpNombre.value = prev.nombre_paciente;
    autocompletado = true;
    inpNombre.readOnly = true;
    inpNombre.classList.add('field-readonly');

    if (prev.estado === ESTADO.ARCHIVO) {
      if (aviso) {
        aviso.className = 'bit-aviso bit-aviso-ok';
        aviso.innerHTML =
          `Este expediente está <strong>en el archivo</strong>. Al registrar la salida se saca ` +
          `y se abre el <strong>ciclo ${prev.ciclo + 1}</strong>, conservando su historial. ` +
          `El nombre se toma del registro existente.`;
      }
      alCambiar('reapertura', prev);
    } else {
      if (aviso) {
        aviso.className = 'bit-aviso bit-aviso-error';
        aviso.innerHTML =
          `Este expediente sigue en circulación: <strong>${escHtml(prev.estado)}</strong> · ` +
          `${escHtml(prev.estado === ESTADO.TRANSITO ? prev.destino_pendiente : prev.departamento_actual)}. ` +
          `No puede volver a salir hasta que regrese y Admisión lo archive.`;
      }
      alCambiar('activo', prev);
    }
  }

  inpExp.addEventListener('change', consultar);
  return consultar;
}

function abrirNuevo() {
  if (filaActiva) filaActiva.classList.remove('active');
  filaActiva = null;
  expActivo  = null;

  document.getElementById('panel-title').textContent = 'Registrar expediente';
  document.getElementById('panel-subtitle').textContent = 'Transferirlo a un departamento o dejarlo en Admisión';

  document.querySelector('#side-panel .panel-body').innerHTML = `
    <div class="bit-modos">
      <button type="button" class="bit-modo activo" data-modo="uno">Un expediente</button>
      <button type="button" class="bit-modo" data-modo="varios">Varios a la vez</button>
    </div>
    <div id="bit-nuevo-cuerpo"></div>`;

  document.getElementById('side-panel').classList.add('open');
  document.getElementById('app-body').classList.add('panel-open');

  document.querySelectorAll('.bit-modo').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.bit-modo').forEach(b => b.classList.remove('activo'));
      btn.classList.add('activo');
      if (btn.dataset.modo === 'uno') pintarNuevoUno();
      else pintarNuevoVarios();
    });
  });

  pintarNuevoUno();
}

/* ── Modo: un expediente ──────────────────────────────────────────────── */

function pintarNuevoUno() {
  document.getElementById('bit-nuevo-cuerpo').innerHTML = `
    <div class="bit-accion">
      <div class="field-group">
        <label for="bit-nuevo-exp">Número de expediente *</label>
        <input type="text" id="bit-nuevo-exp" autocomplete="off" placeholder="Ej. 10432">
      </div>
      <div id="bit-nuevo-aviso" class="bit-aviso" style="display:none"></div>
      <div class="field-group">
        <label for="bit-nuevo-nombre">Nombre del paciente *</label>
        <input type="text" id="bit-nuevo-nombre" autocomplete="off">
      </div>
      ${formDestinoAlta('bit-nuevo')}
      <div class="field-group">
        <label for="bit-nuevo-obs">Observaciones (opcional)</label>
        <input type="text" id="bit-nuevo-obs" placeholder="Ej. cirugía programada 9:00 am">
      </div>
      <button class="btn btn-new" id="bit-btn-crear" disabled>Elige qué hacer con el expediente</button>
      <p class="bit-nota">
        Escribe el número de expediente y sal del campo: si ya está en la
        bitácora se completa el nombre solo y se abre un ciclo nuevo
        conservando su historial.
      </p>
    </div>`;

  const inpExp    = document.getElementById('bit-nuevo-exp');
  const inpNombre = document.getElementById('bit-nuevo-nombre');
  const aviso     = document.getElementById('bit-nuevo-aviso');
  const btnCrear  = document.getElementById('bit-btn-crear');
  inpExp.focus();

  // El botón depende de dos cosas: que el expediente pueda salir y que se elija qué hacer.
  let enCirculacion = false;
  let modo = null;
  const pintarBoton = () => {
    btnCrear.disabled = enCirculacion || !modo;
    btnCrear.textContent = modo ? ETIQUETA_ALTA[modo] : 'Elige qué hacer con el expediente';
  };

  vincularAutocompletado(inpExp, inpNombre, aviso, estado => {
    enCirculacion = estado === 'activo';
    pintarBoton();
  });
  const leerDestino = conectarDestinoAlta('bit-nuevo', m => { modo = m; pintarBoton(); });

  btnCrear.addEventListener('click', async () => {
    const expediente = inpExp.value.trim();
    const nombre     = inpNombre.value.trim();
    const destino    = leerDestino();
    const obs        = document.getElementById('bit-nuevo-obs').value.trim();

    if (!expediente) { showToast('El número de expediente es obligatorio.', true); return; }
    if (!nombre)     { showToast('El nombre del paciente es obligatorio.', true); return; }
    if (!destino)    { showToast('Elige si se transfiere o se queda en Admisión.', true); return; }

    btnCrear.disabled = true;
    btnCrear.textContent = 'Guardando…';
    setStatus('loading', 'Guardando…');
    guardando = true;

    try {
      const res = await api.aperturar({ expediente, nombre, destino, usuario, observaciones: obs });
      showToast(res.mensaje || 'Salida registrada.');
      setStatus('online', 'Guardado');
      await cargar();
      const creado = expedientes.find(e => e.expediente === expediente.toUpperCase());
      if (creado) abrirExpediente(creado, null);
      else cerrarPanel();
    } catch (e) {
      pintarBoton();
      setStatus('error', 'Error al guardar');
      showToast(e.message, true);
    } finally {
      guardando = false;
    }
  });
}

/* ── Modo: varios expedientes ─────────────────────────────────────────── */

const MAX_ALTA_LOTE = 25;   // debe coincidir con BIT_MAX_ALTA del backend
let contadorRenglon = 0;

function pintarNuevoVarios() {
  document.getElementById('bit-nuevo-cuerpo').innerHTML = `
    <div class="bit-accion">
      <p class="bit-accion-texto">
        Captura los expedientes que van al mismo lugar. Al salir del campo
        de número, los que ya existen completan su nombre solos.
      </p>

      <div class="bit-renglones-encabezado">
        <span>Expediente</span><span>Nombre del paciente</span><span></span>
      </div>
      <div id="bit-renglones"></div>

      <button type="button" class="bit-agregar-renglon" id="bit-add-renglon">
        + Agregar renglón
      </button>

      ${formDestinoAlta('bit-varios')}
      <div class="field-group">
        <label for="bit-varios-obs">Observaciones para todos (opcional)</label>
        <input type="text" id="bit-varios-obs" placeholder="Ej. cirugías programadas del turno matutino">
      </div>

      <button class="btn btn-new" id="bit-btn-crear-varios" disabled>Elige qué hacer con los expedientes</button>
      <p class="bit-nota">
        Máximo ${MAX_ALTA_LOTE} expedientes por operación. Los renglones vacíos
        se ignoran. Si alguno no se puede procesar, los demás sí se registran y
        se te muestra el detalle.
      </p>
    </div>`;

  for (let i = 0; i < 3; i++) agregarRenglon();

  document.getElementById('bit-add-renglon').addEventListener('click', () => {
    const cont = document.getElementById('bit-renglones');
    if (cont.children.length >= MAX_ALTA_LOTE) {
      showToast(`Máximo ${MAX_ALTA_LOTE} expedientes por operación.`, true);
      return;
    }
    agregarRenglon().querySelector('input').focus();
  });

  const btnVarios = document.getElementById('bit-btn-crear-varios');
  leerDestinoVarios = conectarDestinoAlta('bit-varios', modo => {
    btnVarios.disabled = false;
    btnVarios.textContent = ETIQUETA_ALTA[modo];
  });
  btnVarios.addEventListener('click', registrarVariasSalidas);
}

/** Lector del destino del modo "varios"; se reasigna cada vez que se pinta el formulario. */
let leerDestinoVarios = () => null;

function agregarRenglon() {
  const cont = document.getElementById('bit-renglones');
  const id = ++contadorRenglon;

  const fila = document.createElement('div');
  fila.className = 'bit-renglon';
  fila.innerHTML = `
    <input type="text" id="bit-r-exp-${id}" autocomplete="off" placeholder="10432">
    <input type="text" id="bit-r-nom-${id}" autocomplete="off" placeholder="Nombre del paciente">
    <button type="button" class="bit-quitar-renglon" title="Quitar renglón">&times;</button>
    <span class="bit-renglon-aviso"></span>`;
  cont.appendChild(fila);

  const inpExp = fila.querySelector(`#bit-r-exp-${id}`);
  const inpNom = fila.querySelector(`#bit-r-nom-${id}`);
  const nota   = fila.querySelector('.bit-renglon-aviso');

  vincularAutocompletado(inpExp, inpNom, null, (estado, prev) => {
    fila.classList.remove('bit-renglon-ok', 'bit-renglon-mal');
    if (estado === 'reapertura') {
      fila.classList.add('bit-renglon-ok');
      nota.textContent = `En archivo · se saca y abre el ciclo ${prev.ciclo + 1}`;
    } else if (estado === 'activo') {
      fila.classList.add('bit-renglon-mal');
      nota.textContent = `Sigue en circulación (${prev.estado === ESTADO.TRANSITO
        ? 'hacia ' + prev.destino_pendiente : prev.departamento_actual}) — no puede salir`;
    } else {
      nota.textContent = '';
    }
  });

  // Enter en el último renglón agrega otro, para capturar sin soltar el teclado.
  inpNom.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (fila === cont.lastElementChild) document.getElementById('bit-add-renglon').click();
  });

  fila.querySelector('.bit-quitar-renglon').addEventListener('click', () => {
    fila.remove();
    if (!cont.children.length) agregarRenglon();
  });

  return fila;
}

function leerRenglones() {
  const items = [];
  const vistos = new Set();
  const duplicados = [];

  document.querySelectorAll('#bit-renglones .bit-renglon').forEach(fila => {
    const [inpExp, inpNom] = fila.querySelectorAll('input');
    const expediente = inpExp.value.trim().toUpperCase();
    const nombre     = inpNom.value.trim();
    if (!expediente) return;                       // renglón vacío: se ignora
    if (vistos.has(expediente)) { duplicados.push(expediente); return; }
    vistos.add(expediente);
    items.push({ expediente, nombre, bloqueado: fila.classList.contains('bit-renglon-mal') });
  });

  return { items, duplicados };
}

async function registrarVariasSalidas(ev) {
  const { items, duplicados } = leerRenglones();

  if (!items.length) {
    showToast('Captura al menos un expediente.', true);
    return;
  }
  if (duplicados.length) {
    showToast(`Expediente repetido en la lista: ${duplicados.join(', ')}`, true);
    return;
  }

  const bloqueados = items.filter(i => i.bloqueado);
  if (bloqueados.length) {
    showToast(`Quita los expedientes que siguen activos: ${
      bloqueados.map(i => i.expediente).join(', ')}`, true);
    return;
  }

  const sinNombre = items.filter(i => !i.nombre);
  if (sinNombre.length) {
    showToast(`Falta el nombre del paciente en: ${
      sinNombre.map(i => i.expediente).join(', ')}`, true);
    return;
  }

  const destino = leerDestinoVarios();
  if (!destino) {
    showToast('Elige si se transfieren o se quedan en Admisión.', true);
    return;
  }

  const boton = ev.currentTarget;
  const obs   = document.getElementById('bit-varios-obs').value.trim();

  const etiqueta = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  setStatus('loading', `Registrando ${items.length} expediente(s)…`);
  guardando = true;

  try {
    const res = await api.aperturarLote({ items, destino, usuario, observaciones: obs });
    setStatus('online', 'Guardado');
    showToast(res.mensaje, res.fallidos.length > 0);
    await cargar();
    if (res.fallidos.length) mostrarResultadoLote(res);
    else cerrarPanel();
  } catch (e) {
    setStatus('error', 'Error al guardar');
    showToast(e.message, true);
  } finally {
    guardando = false;
    boton.disabled = false;
    boton.textContent = etiqueta;
  }
}


function cerrarPanel() {
  document.getElementById('side-panel').classList.remove('open');
  document.getElementById('app-body').classList.remove('panel-open');
  if (filaActiva) { filaActiva.classList.remove('active'); filaActiva = null; }
  expActivo = null;
}

/* ── Eventos ──────────────────────────────────────────────────────────── */

document.getElementById('btn-logout').addEventListener('click', logout);
document.getElementById('btn-all').addEventListener('click', () => {
  document.getElementById('search-input').value = '';
  verTodos();
});
document.getElementById('btn-close-panel').addEventListener('click', cerrarPanel);
document.getElementById('btn-new').addEventListener('click', abrirNuevo);

document.getElementById('btn-search').addEventListener('click', () => {
  const q = document.getElementById('search-input').value.trim();
  if (!q) { showToast('Escribe algo para buscar.', true); return; }
  const type = document.querySelector('input[name=stype]:checked').value;
  buscar(type, q);
});

document.getElementById('search-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-search').click();
});

document.getElementById('filtro-depto').addEventListener('change', e => {
  filtroDepto = e.target.value;
  paginaActual = 1;
  // Filtrar por "Archivo" sin traer los archivados mostraría una lista vacía.
  if (filtroDepto === ARCHIVO && !incluirArchivo) {
    incluirArchivo = true;
    document.getElementById('chk-archivo').checked = true;
    verTodos();
    return;
  }
  renderVista();
});

document.getElementById('chk-archivo').addEventListener('change', e => {
  incluirArchivo = e.target.checked;
  verTodos();
});

document.getElementById('chk-auto').addEventListener('change', e => {
  autoRefresco = e.target.checked;
  pintarSync();
  if (autoRefresco) { cargar({ silencioso: true }); programarRefresco(); }
  else clearTimeout(temporizador);
});

document.getElementById('bit-btn-refrescar').addEventListener('click', () =>
  cargar({ silencioso: true }));

/* ── Acciones en lote ─────────────────────────────────────────────────── */

const obsLote = () => document.getElementById('bit-lote-obs').value.trim();

document.getElementById('chk-todos').addEventListener('change', e => {
  // Solo afecta a la página visible, no a los expedientes de otras páginas.
  const filtrados = aplicarFiltros(expedientes).slice().sort(ordenar);
  const inicio = (paginaActual - 1) * PAGE_SIZE;
  filtrados.slice(inicio, inicio + PAGE_SIZE).forEach(exp => {
    if (e.target.checked) seleccion.add(exp.expediente);
    else seleccion.delete(exp.expediente);
  });
  renderVista();
});

document.getElementById('bit-lote-limpiar').addEventListener('click', limpiarSeleccion);

document.getElementById('bit-lote-entregar').addEventListener('click', e => {
  const claves = seleccionados().filter(x => puedeEntregar(usuario, x)).map(x => x.expediente);
  const destino = document.getElementById('bit-lote-destino').value;
  ejecutarLote(e.currentTarget, claves, () =>
    api.entregarLote({ expedientes: claves, destino, usuario, observaciones: obsLote() }));
});

document.getElementById('bit-lote-recibir').addEventListener('click', e => {
  const claves = seleccionados().filter(x => puedeRecibir(usuario, x)).map(x => x.expediente);
  ejecutarLote(e.currentTarget, claves, () =>
    api.recibirLote({ expedientes: claves, usuario, observaciones: obsLote() }));
});

document.getElementById('bit-lote-archivar').addEventListener('click', e => {
  const claves = seleccionados().filter(x => puedeArchivar(usuario, x)).map(x => x.expediente);
  if (!confirm(`¿Guardar ${claves.length} expediente(s) en el archivo? Terminará su ciclo.`)) return;
  ejecutarLote(e.currentTarget, claves, () =>
    api.archivarLote({ expedientes: claves, usuario, observaciones: obsLote() }));
});

document.getElementById('bit-lote-cancelar').addEventListener('click', abrirCancelarLote);

document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    filtroActivo = filtroActivo === chip.dataset.filter ? null : chip.dataset.filter;
    actualizarChips();
    paginaActual = 1;
    renderVista();
  });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') cerrarPanel();
});

/* ── Init ─────────────────────────────────────────────────────────────── */

document.getElementById('filtro-depto').innerHTML =
  '<option value="">Todos los departamentos</option>' +
  DEPARTAMENTOS.map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('') +
  `<option value="${escHtml(ARCHIVO)}">${escHtml(ARCHIVO)}</option>`;

document.getElementById('header-depto').textContent =
  miDepto ? `${usuario} · ${miDepto}` : usuario;

if (!puedeAperturar(usuario)) {
  document.getElementById('btn-new').style.display = 'none';
  // Solo Admisión cancela transferencias; a los demás sería un botón siempre en (0).
  document.getElementById('bit-lote-cancelar').style.display = 'none';
}

if (miDepto) {
  const chip = document.getElementById('chip-mios');
  chip.querySelector('.chip-depto').textContent = miDepto;
  // El personal de piso casi siempre quiere ver solo lo suyo.
  filtroActivo = 'mios';
  actualizarChips();
} else {
  document.getElementById('chip-mios').style.display = 'none';
}

document.getElementById('umbral-detenidos').textContent =
  ALERTA.ESTANCIA % 60 === 0 ? `${ALERTA.ESTANCIA / 60} h` : fmtDuracion(ALERTA.ESTANCIA);

document.getElementById('chk-auto').checked = autoRefresco;
document.getElementById('intervalo-refresco').textContent = `${AUTO_REFRESCO.SEGUNDOS} s`;
document.getElementById('lbl-auto').title =
  `Consulta el servidor cada ${AUTO_REFRESCO.SEGUNDOS} s con la pestaña a la vista, ` +
  `y cada ${AUTO_REFRESCO.SEGUNDOS_OCULTA / 60} min mientras trabajas en otra. ` +
  'Avisa cuando te envían un expediente.';

/* El "hace X" avanza solo, aparte del ciclo de red, para que el indicador
   no se quede congelado entre consulta y consulta. */
setInterval(pintarSync, 5000);
pintarSync();

cargar().then(programarRefresco);
