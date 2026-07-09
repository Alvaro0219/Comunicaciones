import { defineStore } from 'pinia';
import { loginApi, registerApi, refreshApi } from '../services/api.js';

function parseStoredSession() {
  try {
    const raw = localStorage.getItem('gda_session');
    if (!raw) return { accessToken: null, refreshToken: null, user: null };
    const parsed = JSON.parse(raw);
    return {
      accessToken: parsed.accessToken || null,
      refreshToken: parsed.refreshToken || null,
      user: parsed.user || null
    };
  } catch {
    return { accessToken: null, refreshToken: null, user: null };
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => parseStoredSession(),
  getters: {
    isAuthenticated: (s) => !!s.accessToken,
    role: (s) => s.user?.role || null,
    // Visualizador: solo lectura (no crea macetas, no fuerza riego, no configura)
    canOperate: (s) => ['admin', 'tecnico'].includes(s.user?.role)
  },
  actions: {
    saveSession() {
      localStorage.setItem('gda_session', JSON.stringify({
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        user: this.user
      }));
    },
    hydrate() {
      Object.assign(this, parseStoredSession());
    },
    applySession(res) {
      this.accessToken = res.accessToken;
      this.refreshToken = res.refreshToken;
      this.user = res.user;
      this.saveSession();
    },
    async login(email, password) {
      this.applySession(await loginApi(email, password));
    },
    async register(payload) {
      this.applySession(await registerApi(payload));
    },
    async refreshSession() {
      if (!this.refreshToken) throw new Error('Missing refresh token');
      this.applySession(await refreshApi(this.refreshToken));
    },
    logout() {
      this.accessToken = null;
      this.refreshToken = null;
      this.user = null;
      localStorage.removeItem('gda_session');
    }
  }
});
