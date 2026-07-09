import axios from 'axios';
import { useAuthStore } from '../stores/auth.js';
import { ApiError } from '../utils/ApiError.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api';

const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const auth = useAuthStore();
  if (auth.accessToken) config.headers.Authorization = `Bearer ${auth.accessToken}`;
  return config;
});

function redirectToLoginWithReason(reason) {
  sessionStorage.setItem('gda_login_reason', reason);
  if (!window.location.pathname.startsWith('/login')) window.location.assign('/login');
}

let refreshPromise = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const auth = useAuthStore();
    const originalRequest = error?.config;
    const status = error?.response?.status;
    const isAuthRoute = originalRequest?.url?.includes('/auth/login') || originalRequest?.url?.includes('/auth/refresh');

    if (status !== 401 || !originalRequest || originalRequest._retry || isAuthRoute) {
      // Propagar el error del backend como ApiError tipado si viene con contrato
      const body = error?.response?.data;
      if (body?.error) throw new ApiError(body.error.message, body.error.code, status);
      throw error;
    }
    if (!auth.refreshToken) {
      auth.logout();
      redirectToLoginWithReason('session-expired');
      throw error;
    }

    originalRequest._retry = true;
    try {
      if (!refreshPromise) refreshPromise = auth.refreshSession();
      await refreshPromise;
      originalRequest.headers.Authorization = `Bearer ${auth.accessToken}`;
      return api.request(originalRequest);
    } catch (refreshError) {
      auth.logout();
      redirectToLoginWithReason('session-expired');
      throw refreshError;
    } finally {
      refreshPromise = null;
    }
  }
);

function unwrap(data, fallbackMessage, status = null) {
  if (!data.success) {
    throw new ApiError(data.error?.message || fallbackMessage, data.error?.code || 'UNKNOWN_ERROR', status);
  }
  return data.data;
}

// ─── Auth ───────────────────────────────────────────
export async function loginApi(email, password) {
  const { data, status } = await api.post('/auth/login', { email, password });
  return unwrap(data, 'No se pudo iniciar sesión', status);
}

export async function registerApi(payload) {
  const { data, status } = await api.post('/auth/register', payload);
  return unwrap(data, 'No se pudo registrar', status);
}

export async function refreshApi(refreshToken) {
  const { data, status } = await api.post('/auth/refresh', { refreshToken });
  return unwrap(data, 'No se pudo refrescar la sesión', status);
}

// ─── Macetas ────────────────────────────────────────
export async function fetchPots(params = {}) {
  const { data } = await api.get('/pots', { params });
  return data.data || { items: [], pagination: {} };
}

export async function fetchAllPots() {
  const res = await fetchPots({ limit: 100 });
  return res.items || [];
}

export async function fetchPot(id) {
  const { data, status } = await api.get(`/pots/${id}`);
  return unwrap(data, 'No se pudo cargar la maceta', status);
}

export async function createPot(payload) {
  const { data, status } = await api.post('/pots', payload);
  return unwrap(data, 'No se pudo crear la maceta', status);
}

export async function updatePot(id, payload) {
  const { data, status } = await api.put(`/pots/${id}`, payload);
  return unwrap(data, 'No se pudo actualizar la maceta', status);
}

export async function deletePot(id) {
  const { data, status } = await api.delete(`/pots/${id}`);
  return unwrap(data, 'No se pudo eliminar la maceta', status);
}

export async function irrigatePot(id, durationSec = null) {
  const payload = durationSec ? { durationSec } : {};
  const { data, status } = await api.post(`/pots/${id}/irrigate`, payload);
  return unwrap(data, 'No se pudo enviar la orden de riego', status);
}

export async function fetchPotWeather(id) {
  const { data, status } = await api.get(`/pots/${id}/weather`);
  return unwrap(data, 'No se pudo cargar el pronóstico', status);
}

// ─── Telemetría e historial ─────────────────────────
export async function fetchRecentReadings(id, hours = 24) {
  const { data } = await api.get(`/pots/${id}/readings/recent`, { params: { hours } });
  return data.data || [];
}

export async function fetchReadings(id, params = {}) {
  const { data } = await api.get(`/pots/${id}/readings`, { params });
  return data.data || { items: [], pagination: {} };
}

export async function fetchPotEvents(id, params = {}) {
  const { data } = await api.get(`/pots/${id}/events`, { params });
  return data.data || { items: [], pagination: {} };
}

// ─── Alertas ────────────────────────────────────────
export async function fetchAlerts(params = {}) {
  const { data } = await api.get('/alerts', { params });
  return data.data || { items: [], pagination: {} };
}

export async function resolveAlert(id) {
  const { data, status } = await api.patch(`/alerts/${id}/resolve`);
  return unwrap(data, 'No se pudo resolver la alerta', status);
}

// ─── Usuarios ───────────────────────────────────────
export async function fetchMe() {
  const { data, status } = await api.get('/users/me');
  return unwrap(data, 'No se pudo cargar el perfil', status);
}

export async function updateMyPreferences(alertPrefs) {
  const { data, status } = await api.put('/users/me/preferences', { alertPrefs });
  return unwrap(data, 'No se pudieron guardar las preferencias', status);
}

export async function fetchUsers(params = {}) {
  const { data } = await api.get('/users', { params });
  return data.data || { items: [], pagination: {} };
}

export async function createUser(payload) {
  const { data, status } = await api.post('/users', payload);
  return unwrap(data, 'No se pudo crear el usuario', status);
}

export async function updateUser(id, payload) {
  const { data, status } = await api.put(`/users/${id}`, payload);
  return unwrap(data, 'No se pudo actualizar el usuario', status);
}

// ─── Stream en tiempo real (SSE) ────────────────────
export async function getStreamToken() {
  const { data, status } = await api.post('/stream/token');
  return unwrap(data, 'No se pudo abrir el stream', status);
}

export function buildStreamUrl(token) {
  return `${API_BASE_URL}/stream?token=${encodeURIComponent(token)}`;
}

export default api;
