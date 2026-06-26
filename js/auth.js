import { API_URL } from './config.js';

const SESSION_KEY = 'cmsl_session';

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
  const url = `${API_URL}?action=login&usuario=${encodeURIComponent(usuario)}&clave=${encodeURIComponent(clave)}`;
  const response = await fetch(url);

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('La respuesta del servidor no es válida');
  }

  if (data.error) throw new Error(data.error);
  if (!data.success) throw new Error('Usuario o contraseña incorrectos');

  localStorage.setItem(SESSION_KEY, JSON.stringify({
    usuario: data.nombre || usuario,
  }));

  return data;
}
