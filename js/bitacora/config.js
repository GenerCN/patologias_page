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

/**
 * Ubicación del archivo clínico. NO es un departamento: no está en
 * DEPARTAMENTOS, nadie la representa y no aparece como destino de una
 * entrega. Solo Admisión mete y saca expedientes de ahí.
 * Duplicado en BIT_ARCHIVO de apps_script/Codigo.gs.
 */
export const ARCHIVO = 'Archivo';

export const ESTADO = {
  DEPTO:    'En departamento',
  TRANSITO: 'En tránsito',
  ARCHIVO:  'Archivo',
};

/** Estado del movimiento que representa el paso Admisión → Archivo. */
export const MOV_ARCHIVADO = 'Archivado';

/**
 * Refresco automático.
 *
 * Apps Script no puede avisarle al navegador cuando cambia la hoja: no hay
 * websockets ni push. La única opción es preguntar cada cierto tiempo.
 *
 * 45 s es el punto medio entre enterarse rápido y no castigar la cuota del
 * script: un expediente cambia de departamento cada varios minutos, no cada
 * segundo. Bajarlo de 20 s no aporta nada y multiplica las llamadas.
 *
 * Con la pestaña oculta se sigue consultando, pero más despacio: así el
 * contador del título y el aviso de llegadas funcionan mientras el usuario
 * trabaja en otra pestaña, sin gastar cuota al ritmo de una pestaña activa.
 */
export const AUTO_REFRESCO = {
  SEGUNDOS: 45,           // pestaña a la vista
  SEGUNDOS_OCULTA: 120,   // pestaña en segundo plano
  ACTIVO_POR_DEFECTO: true,
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

/**
 * Quién puede abrir el módulo de bitácora.
 *
 * La regla falla cerrado a propósito: solo entra quien tiene un departamento
 * asignado en USUARIO_DEPTO, más el superusuario. Así `farmacia` y
 * `contabilidad` quedan fuera, y cualquier usuario que se agregue a la hoja
 * `Usuarios` sin mapearlo aquí tampoco entra por accidente.
 */
export function tieneAccesoBitacora(usuario) {
  return Boolean(deptoDe(usuario)) || esSuper(usuario);
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

/* El archivo es exclusivo de Admisión: solo ella guarda expedientes ahí
   (y solo si ya regresaron a Admisión) y solo ella los saca. */

export function puedeArchivar(usuario, exp) {
  if (!exp || exp.estado !== ESTADO.DEPTO) return false;
  if (exp.departamento_actual !== 'Admisión') return false;
  return esSuper(usuario) || deptoDe(usuario) === 'Admisión';
}

export function puedeSacarDeArchivo(usuario, exp) {
  if (!exp || exp.estado !== ESTADO.ARCHIVO) return false;
  return puedeAperturar(usuario);
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
