import { API_URL } from '../config.js';

/* Mismo criterio de reintento que js/api.js: Apps Script devuelve 404/5xx
   en arranques en frío y hay que insistir antes de darlo por muerto. */
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchWithRetry(url, retries = 2) {
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok && (res.status === 404 || res.status >= 500) && i < retries) {
        await delay(1500 * (i + 1));
        continue;
      }
      return res;
    } catch (e) {
      lastError = e;
      if (i < retries) await delay(1500 * (i + 1));
    }
  }
  throw lastError ?? new Error('Error de red');
}

async function call(params) {
  const url = new URL(API_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v ?? ''));

  const res = await fetchWithRetry(url.toString());
  if (!res.ok) throw new Error(`El servicio no respondió (HTTP ${res.status})`);

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('La respuesta del servidor no es JSON válido');
  }

  if (data.error) throw new Error(data.error);
  return data;
}

export async function getExpedientes({ incluirArchivo = false } = {}) {
  // El parámetro del backend conserva su nombre viejo por compatibilidad.
  const data = await call({ action: 'bitGetAll', cerrados: incluirArchivo ? '1' : '0' });
  return { records: data.records || [], servidor: data.servidor };
}

export async function buscarExpedientes(type, query) {
  const data = await call({ action: 'bitSearch', type, query });
  return { records: data.records || [], servidor: data.servidor };
}

/** Búsqueda exacta, incluidos los archivados. Devuelve { encontrado, expediente }. */
export async function consultar(expediente) {
  const data = await call({ action: 'bitConsultar', expediente });
  return { encontrado: Boolean(data.encontrado), expediente: data.expediente || null };
}

export async function getMovimientos(expediente) {
  const data = await call({ action: 'bitMovimientos', expediente });
  return data.movimientos || [];
}

export function aperturar({ expediente, nombre, destino, usuario, observaciones }) {
  return call({ action: 'bitAperturar', expediente, nombre, destino, usuario, observaciones });
}

export function entregar({ expediente, destino, usuario, observaciones }) {
  return call({ action: 'bitEntregar', expediente, destino, usuario, observaciones });
}

export function recibir({ expediente, usuario, observaciones }) {
  return call({ action: 'bitRecibir', expediente, usuario, observaciones });
}

export function archivar({ expediente, usuario, observaciones }) {
  return call({ action: 'bitArchivar', expediente, usuario, observaciones });
}

export function cancelarTransferencia({ expediente, motivo, usuario, observaciones }) {
  return call({ action: 'bitCancelar', expediente, motivo, usuario, observaciones });
}

export function deshacer({ expediente, usuario }) {
  return call({ action: 'bitDeshacer', expediente, usuario });
}

/* ── Operaciones en lote ────────────────────────────────────────────────
   Devuelven { success, procesados: [clave], fallidos: [{expediente, motivo}],
   mensaje }. El resultado es parcial a propósito: si 7 de 8 se movieron,
   esos 7 cambiaron de lugar de verdad. */

export function entregarLote({ expedientes, destino, usuario, observaciones }) {
  return call({
    action: 'bitEntregarLote',
    expedientes: expedientes.join(','), destino, usuario, observaciones,
  });
}

export function recibirLote({ expedientes, usuario, observaciones }) {
  return call({
    action: 'bitRecibirLote',
    expedientes: expedientes.join(','), usuario, observaciones,
  });
}

export function archivarLote({ expedientes, usuario, observaciones }) {
  return call({
    action: 'bitArchivarLote',
    expedientes: expedientes.join(','), usuario, observaciones,
  });
}

export function cancelarTransferenciaLote({ expedientes, motivo, usuario, observaciones }) {
  return call({
    action: 'bitCancelarLote',
    expedientes: expedientes.join(','), motivo, usuario, observaciones,
  });
}

/** items: [{ expediente, nombre }] — el nombre solo se usa para los nuevos. */
export function aperturarLote({ items, destino, usuario, observaciones }) {
  return call({
    action: 'bitAperturarLote',
    items: JSON.stringify(items.map(i => ({ e: i.expediente, n: i.nombre }))),
    destino, usuario, observaciones,
  });
}
