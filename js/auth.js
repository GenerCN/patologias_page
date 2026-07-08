import { API_URL, PERMISSIONS } from './config.js';

const SESSION_KEY = 'cmsl_session';

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

function normUser(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function getEditableSections() {
  const session = getSession();
  if (!session) return [];
  return PERMISSIONS[normUser(session.usuario)] || [];
}

export function canCreateRecord() {
  const session = getSession();
  if (!session) return false;
  const key = normUser(session.usuario);
  return key === 'farmacia' || key === 'admin';
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

export function requireAuth(redirectTo = 'login.html') {
  const session = getSession();
  if (!session) {
    window.location.replace(redirectTo);
    return null;
  }
  return session;
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
  window.location.replace('login.html');
}

export async function login(usuario, clave) {
  const url = new URL(API_URL);
  url.searchParams.set('action',  'login');
  url.searchParams.set('usuario', usuario);
  url.searchParams.set('clave',   clave);

  const response = await fetchWithRetry(url.toString());

  if (!response.ok) throw new Error(`El servicio no respondió (${response.status}). Intenta de nuevo.`);

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('La respuesta del servidor no es válida. Intenta de nuevo.');
  }

  if (data.error) throw new Error(data.error);
  if (!data.success) throw new Error('Usuario o contraseña incorrectos');

  localStorage.setItem(SESSION_KEY, JSON.stringify({
    usuario: data.nombre || usuario,
  }));

  return data;
}
