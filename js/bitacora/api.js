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

export async function getExpedientes({ incluirCerrados = false } = {}) {
  const data = await call({ action: 'bitGetAll', cerrados: incluirCerrados ? '1' : '0' });
  return { records: data.records || [], servidor: data.servidor };
}

export async function buscarExpedientes(type, query) {
  const data = await call({ action: 'bitSearch', type, query });
  return { records: data.records || [], servidor: data.servidor };
}

/** Búsqueda exacta, incluidos los cerrados. Devuelve { encontrado, expediente }. */
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

export function cerrar({ expediente, usuario, observaciones }) {
  return call({ action: 'bitCerrar', expediente, usuario, observaciones });
}

export function deshacer({ expediente, usuario }) {
  return call({ action: 'bitDeshacer', expediente, usuario });
}
