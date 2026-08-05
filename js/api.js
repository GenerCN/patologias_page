import { API_URL, KEY_MAP } from './config.js';
import { setStatus } from './utils.js';

/* Reintenta la petición hasta `retries` veces cuando Google devuelve
   404 / 5xx (cold-start) o hay un error de red transitorio.
   No reintenta errores de lógica de negocio (4xx distintos de 404). */
async function fetchWithRetry(url, options = {}, retries = 2) {
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      // Reintentar solo en 404 o 5xx (problemas de infraestructura Google)
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

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function apiFetch(params) {
  setStatus('loading', 'Conectando…');
  const url = new URL(API_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetchWithRetry(url.toString(), { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiUpdateField(id, field, value) {
  const sheetField = KEY_MAP[field] || field;
  const url = new URL(API_URL);
  url.searchParams.set('action',     'update');
  url.searchParams.set('id',         id);
  url.searchParams.set('field',      sheetField);
  url.searchParams.set('value',      value);

  const response = await fetchWithRetry(url.toString(), { method: 'GET' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  let data;
  try { data = await response.json(); }
  catch { throw new Error('La respuesta del servidor no es JSON válido'); }

  if (data.error)    throw new Error(data.error);
  if (!data.success) throw new Error(JSON.stringify(data));
  return data;
}

export async function apiCreateRecord(data) {
  const url = new URL(API_URL);
  url.searchParams.set('action', 'create');
  Object.entries(data).forEach(([key, value]) => {
    const sheetField = KEY_MAP[key];
    if (sheetField) url.searchParams.set(sheetField, value ?? '');
  });

  const response = await fetchWithRetry(url.toString(), { method: 'GET' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  let result;
  try { result = await response.json(); }
  catch { throw new Error('La respuesta del servidor no es JSON válido'); }

  if (result.error)    throw new Error(result.error);
  if (!result.success) throw new Error(JSON.stringify(result));
  return result;
}
