import { API_URL, KEY_MAP } from './config.js';
import { setStatus } from './utils.js';

export async function apiCreateRecord(data) {
  const url = new URL(API_URL);
  url.searchParams.set('action', 'create');
  Object.entries(data).forEach(([key, value]) => {
    const sheetField = KEY_MAP[key];
    if (sheetField) url.searchParams.set(sheetField, value ?? '');
  });

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('La respuesta del servidor no es JSON válido');
  }

  if (result.error)    throw new Error(result.error);
  if (!result.success) throw new Error(JSON.stringify(result));

  return result;
}

export async function apiFetch(params) {
  setStatus('loading', 'Conectando…');
  const url = new URL(API_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function apiUpdateField(folio, field, value) {
  const sheetField = KEY_MAP[field] || field;
  const url = `${API_URL}?action=update&folio=${encodeURIComponent(folio)}&field=${encodeURIComponent(sheetField)}&value=${encodeURIComponent(value)}`;
  const response = await fetch(url);

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('La respuesta del servidor no es JSON válido');
  }

  if (data.error)    throw new Error(data.error);
  if (!data.success) throw new Error(JSON.stringify(data));

  return data;
}
