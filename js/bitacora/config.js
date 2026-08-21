/* Configuración del módulo Bitácora de Expedientes.
   OJO: DEPARTAMENTOS, USUARIO_DEPTO y SUPERUSUARIOS están duplicados en
   apps_script/Bitacora.gs. Si cambias uno, cambia el otro. */

export const DEPARTAMENTOS = [
  'Admisión',
  'Preoperatorio',
  'Oftalmología',
  'Quirófanos',
  'Recuperación',
  'Hospitalización',
];

/** Siguiente paso habitual del expediente. No es obligatorio: cualquier
    departamento puede recibirlo, esto solo preselecciona el destino. */
export const FLUJO_SUGERIDO = {
  'Admisión':        ['Preoperatorio', 'Oftalmología'],
  'Preoperatorio':   ['Quirófanos'],
  'Oftalmología':    ['Quirófanos'],
  'Quirófanos':      ['Recuperación'],
  'Recuperación':    ['Hospitalización', 'Admisión'],
  'Hospitalización': ['Admisión'],
};

/** Usuario (minúsculas, sin acentos) → departamento que representa. */
export const USUARIO_DEPTO = {
  admision:        'Admisión',
  preoperatorio:   'Preoperatorio',
  oftalmologia:    'Oftalmología',
  quirofanos:      'Quirófanos',
  recuperacion:    'Recuperación',
  hospitalizacion: 'Hospitalización',
};

/** Pueden operar a nombre de cualquier departamento. */
export const SUPERUSUARIOS = ['admin'];

/** Solo lectura: ven la bitácora pero no registran movimientos. */
export const SOLO_LECTURA = ['farmacia', 'contabilidad'];

export const ESTADO = {
  DEPTO:    'En departamento',
  TRANSITO: 'En tránsito',
  CERRADO:  'Cerrado',
};

/** Minutos a partir de los cuales se marca en rojo. */
export const ALERTA = {
  TRANSITO: 60,        // 1 h en tránsito sin acuse de recibo
  ESTANCIA: 60 * 24,   // 24 h parado en un departamento
};

const RE_ACENTOS = new RegExp('[\\u0300-\\u036f]', 'g');

export function normUser(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(RE_ACENTOS, '').trim();
}

export function deptoDe(usuario) {
  return USUARIO_DEPTO[normUser(usuario)] || null;
}

export function esSuper(usuario) {
  return SUPERUSUARIOS.includes(normUser(usuario));
}

export function esSoloLectura(usuario) {
  return SOLO_LECTURA.includes(normUser(usuario));
}

/* ── Permisos (espejo de las validaciones del backend) ─────────────────── */

export function puedeAperturar(usuario) {
  return esSuper(usuario) || deptoDe(usuario) === 'Admisión';
}

export function puedeEntregar(usuario, exp) {
  if (!exp || exp.estado !== ESTADO.DEPTO) return false;
  return esSuper(usuario) || deptoDe(usuario) === exp.departamento_actual;
}

export function puedeRecibir(usuario, exp) {
  if (!exp || exp.estado !== ESTADO.TRANSITO) return false;
  return esSuper(usuario) || deptoDe(usuario) === exp.destino_pendiente;
}

export function puedeCerrar(usuario, exp) {
  if (!exp || exp.estado !== ESTADO.DEPTO) return false;
  if (exp.departamento_actual !== 'Admisión') return false;
  return esSuper(usuario) || deptoDe(usuario) === 'Admisión';
}

export function puedeDeshacer(usuario) {
  return esSuper(usuario);
}

/** Destinos que tiene sentido ofrecer desde `origen`, sugeridos primero. */
export function destinosDesde(origen) {
  const sugeridos = FLUJO_SUGERIDO[origen] || [];
  const resto = DEPARTAMENTOS.filter(d => d !== origen && !sugeridos.includes(d));
  return { sugeridos, resto };
}
