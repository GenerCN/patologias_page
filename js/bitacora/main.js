import { requireAuth, logout } from '../auth.js';
import { setStatus, showToast, escHtml } from '../utils.js';
import { renderPagination } from '../table.js';
import {
  DEPARTAMENTOS, ESTADO, ALERTA,
  deptoDe, tieneAccesoBitacora,
  puedeAperturar, puedeEntregar, puedeRecibir, puedeCerrar, puedeDeshacer,
  destinosDesde,
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

const PAGE_SIZE = 15;

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
let incluirCerrados = false;
let paginaActual   = 1;
let expActivo      = null;   // expediente abierto en el panel
let filaActiva     = null;

const FILTROS = {
  'transito': exp => exp.estado === ESTADO.TRANSITO,
  'detenidos': exp => {
    const { alerta } = estadoDeAlerta(exp, relojServidor);
    return alerta;
  },
  'mios': exp =>
    exp.departamento_actual === miDepto ||
    (exp.estado === ESTADO.TRANSITO && exp.destino_pendiente === miDepto),
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

function renderVista() {
  const filtrados  = aplicarFiltros(expedientes).slice().sort(ordenar);
  const totalPags  = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  paginaActual     = Math.min(paginaActual, totalPags);
  const inicio     = (paginaActual - 1) * PAGE_SIZE;

  renderTabla(filtrados.slice(inicio, inicio + PAGE_SIZE), relojServidor, abrirExpediente);
  renderPagination(document.getElementById('pagination'), {
    page: paginaActual,
    totalPages: totalPags,
    onPageChange: p => { paginaActual = p; renderVista(); },
  });

  actualizarStats(filtrados.length);
}

/* ── Carga de datos ───────────────────────────────────────────────────── */

async function cargar() {
  setTablaCargando();
  setStatus('loading', 'Conectando…');
  try {
    const { records, servidor } = await api.getExpedientes({ incluirCerrados });
    expedientes   = records;
    relojServidor = servidor;
    paginaActual  = 1;
    renderVista();
    setStatus('online', `${records.length} expediente(s)`);
  } catch (e) {
    setStatus('error', 'Error de conexión');
    mostrarErrorTabla(e.message);
    showToast('No se pudo cargar la bitácora: ' + e.message, true);
  }
}

async function buscar(type, query) {
  setTablaCargando();
  setStatus('loading', 'Buscando…');
  try {
    const { records, servidor } = await api.buscarExpedientes(type, query);
    expedientes   = records;
    relojServidor = servidor;
    paginaActual  = 1;
    renderVista();
    setStatus('online', `${records.length} resultado(s)`);
  } catch (e) {
    setStatus('error', 'Error de conexión');
    mostrarErrorTabla(e.message);
    showToast('Error al buscar: ' + e.message, true);
  }
}

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

  // El paciente volvió: Admisión lo saca de nuevo sin recapturar nada.
  if (puedeAperturar(usuario) && exp.estado === ESTADO.CERRADO) {
    acciones.push(`
      <div class="bit-accion bit-accion-recibir">
        <p class="bit-accion-texto">
          Expediente cerrado el ${fmtFechaHora(exp.fecha_cierre)}.
          Si el paciente regresó, registra la salida aquí: se abrirá el
          <strong>ciclo ${exp.ciclo + 1}</strong> conservando todo el historial anterior.
        </p>
        <div class="field-group">
          <label for="bit-re-destino">Entregar a</label>
          <select id="bit-re-destino">${opcionesSalidaAdmision()}</select>
        </div>
        <div class="field-group">
          <label for="bit-obs-reabrir">Observaciones (opcional)</label>
          <input type="text" id="bit-obs-reabrir" placeholder="Ej. revisión post-operatoria">
        </div>
        <button class="btn btn-new" id="bit-btn-reabrir">Registrar nueva salida</button>
      </div>`);
  }

  if (puedeCerrar(usuario, exp)) {
    acciones.push(`
      <div class="bit-accion">
        <p class="bit-accion-texto">
          El expediente ya regresó a Admisión. Ciérralo para dar por terminado el ciclo.
        </p>
        <div class="field-group">
          <label for="bit-obs-cerrar">Observaciones de cierre (opcional)</label>
          <input type="text" id="bit-obs-cerrar" placeholder="Ej. expediente completo, se archiva">
        </div>
        <button class="btn btn-outline" id="bit-btn-cerrar">Cerrar expediente</button>
      </div>`);
  }

  if (!acciones.length) {
    let motivo;
    if (exp.estado === ESTADO.CERRADO) {
      motivo = 'Este expediente está cerrado. Admisión debe registrar una nueva salida si vuelve a circular.';
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

  const btnCerrar = document.getElementById('bit-btn-cerrar');
  if (btnCerrar) {
    btnCerrar.addEventListener('click', () => ejecutar(btnCerrar, () =>
      api.cerrar({
        expediente: exp.expediente,
        usuario,
        observaciones: document.getElementById('bit-obs-cerrar').value.trim(),
      })));
  }

  const btnDeshacer = document.getElementById('bit-btn-deshacer');
  if (btnDeshacer) {
    btnDeshacer.addEventListener('click', () => {
      const ok = confirm(
        `¿Deshacer el último paso del expediente ${exp.expediente}?\n\n` +
        'Esto revierte el registro más reciente (recepción, entrega o cierre). ' +
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

function abrirNuevo() {
  if (filaActiva) filaActiva.classList.remove('active');
  filaActiva = null;
  expActivo  = null;

  document.getElementById('panel-title').textContent = 'Registrar salida';
  document.getElementById('panel-subtitle').textContent = 'Admisión da de salida el expediente';

  document.querySelector('#side-panel .panel-body').innerHTML = `
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
      <div class="field-group">
        <label for="bit-nuevo-destino">Entregar a *</label>
        <select id="bit-nuevo-destino">${opcionesSalidaAdmision()}</select>
      </div>
      <div class="field-group">
        <label for="bit-nuevo-obs">Observaciones (opcional)</label>
        <input type="text" id="bit-nuevo-obs" placeholder="Ej. cirugía programada 9:00 am">
      </div>
      <button class="btn btn-new" id="bit-btn-crear">Registrar salida</button>
      <p class="bit-nota">
        Escribe el número de expediente y sal del campo: si ya está en la
        bitácora se completa el nombre solo y se abre un ciclo nuevo
        conservando su historial.
      </p>
    </div>`;

  document.getElementById('side-panel').classList.add('open');
  document.getElementById('app-body').classList.add('panel-open');

  const inpExp    = document.getElementById('bit-nuevo-exp');
  const inpNombre = document.getElementById('bit-nuevo-nombre');
  const aviso     = document.getElementById('bit-nuevo-aviso');
  const btnCrear  = document.getElementById('bit-btn-crear');
  inpExp.focus();

  /* Al salir del campo se consulta si el expediente ya existe. Así Admisión
     no reteclea el nombre (y no lo corrompe con una variante distinta), y se
     detecta antes de guardar si el expediente sigue activo en otro lado. */
  let ultimaClaveConsultada = null;
  let nombreAutocompletado  = false;

  async function consultarExpediente() {
    const clave = inpExp.value.trim();
    if (clave === ultimaClaveConsultada) return;
    ultimaClaveConsultada = clave;

    inpNombre.readOnly = false;
    inpNombre.classList.remove('field-readonly');
    btnCrear.disabled = false;
    aviso.style.display = 'none';
    aviso.className = 'bit-aviso';

    /* Si el nombre lo puso el autocompletado de otro expediente hay que
       borrarlo: dejarlo ahí es cómo se termina guardando a un paciente con
       el nombre de otro. Un nombre tecleado a mano sí se respeta. */
    if (nombreAutocompletado) {
      inpNombre.value = '';
      nombreAutocompletado = false;
    }

    if (!clave) return;

    aviso.style.display = '';
    aviso.textContent = 'Verificando si el expediente ya existe…';

    let res;
    try {
      res = await api.consultar(clave);
    } catch (e) {
      aviso.textContent = 'No se pudo verificar el expediente: ' + e.message +
                          ' Puedes continuar; el sistema lo validará al guardar.';
      return;
    }

    // El usuario pudo haber seguido escribiendo mientras respondía el servidor.
    if (inpExp.value.trim() !== clave) return;

    if (!res.encontrado) {
      aviso.style.display = 'none';
      return;
    }

    const prev = res.expediente;
    inpNombre.value = prev.nombre_paciente;
    nombreAutocompletado = true;
    inpNombre.readOnly = true;
    inpNombre.classList.add('field-readonly');

    if (prev.estado === ESTADO.CERRADO) {
      aviso.className = 'bit-aviso bit-aviso-ok';
      aviso.innerHTML =
        `Este expediente ya está en la bitácora. Se abrirá el <strong>ciclo ${prev.ciclo + 1}</strong> ` +
        `conservando sus ${prev.total_movimientos} movimiento(s) anteriores. ` +
        `El nombre se toma del registro existente.`;
    } else {
      aviso.className = 'bit-aviso bit-aviso-error';
      aviso.innerHTML =
        `Este expediente sigue activo: <strong>${escHtml(prev.estado)}</strong> · ` +
        `${escHtml(prev.estado === ESTADO.TRANSITO ? prev.destino_pendiente : prev.departamento_actual)}. ` +
        `No se puede volver a dar de salida hasta que Admisión lo cierre.`;
      btnCrear.disabled = true;
    }
  }

  inpExp.addEventListener('change', consultarExpediente);

  btnCrear.addEventListener('click', async () => {
    const expediente = inpExp.value.trim();
    const nombre     = inpNombre.value.trim();
    const destino    = document.getElementById('bit-nuevo-destino').value;
    const obs        = document.getElementById('bit-nuevo-obs').value.trim();

    if (!expediente) { showToast('El número de expediente es obligatorio.', true); return; }
    if (!nombre)     { showToast('El nombre del paciente es obligatorio.', true); return; }

    const boton = btnCrear;
    boton.disabled = true;
    boton.textContent = 'Guardando…';
    setStatus('loading', 'Guardando…');

    try {
      const res = await api.aperturar({ expediente, nombre, destino, usuario, observaciones: obs });
      showToast(res.mensaje || 'Salida registrada.');
      setStatus('online', 'Guardado');
      await cargar();
      const creado = expedientes.find(e => e.expediente === expediente.toUpperCase());
      if (creado) abrirExpediente(creado, null);
      else cerrarPanel();
    } catch (e) {
      boton.disabled = false;
      boton.textContent = 'Registrar salida';
      setStatus('error', 'Error al guardar');
      showToast(e.message, true);
    }
  });
}

function cerrarPanel() {
  document.getElementById('side-panel').classList.remove('open');
  document.getElementById('app-body').classList.remove('panel-open');
  if (filaActiva) { filaActiva.classList.remove('active'); filaActiva = null; }
  expActivo = null;
}

/* ── Eventos ──────────────────────────────────────────────────────────── */

document.getElementById('btn-logout').addEventListener('click', logout);
document.getElementById('btn-all').addEventListener('click', cargar);
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
  renderVista();
});

document.getElementById('chk-cerrados').addEventListener('change', e => {
  incluirCerrados = e.target.checked;
  cargar();
});

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
  DEPARTAMENTOS.map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('');

document.getElementById('header-depto').textContent =
  miDepto ? `${usuario} · ${miDepto}` : usuario;

if (!puedeAperturar(usuario)) {
  document.getElementById('btn-new').style.display = 'none';
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

cargar();
