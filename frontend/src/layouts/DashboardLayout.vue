<template>
  <div class="gda-shell">
    <aside class="gda-sidebar" v-if="!$q.screen.lt.md">
      <div class="gda-brand">
        <BrandMark :size="26" class="gda-brand-mark" />
        <div>
          <span class="gda-brand-name">GDA</span>
          <span class="gda-brand-sub">Gemelo Digital Agrícola</span>
        </div>
      </div>
      <nav class="gda-nav">
        <router-link
          v-for="item in navItems" :key="item.path"
          :to="item.path"
          class="gda-nav-link"
          :class="{ active: isActive(item.path) }"
        >
          <q-icon :name="item.icon" size="19px" />
          {{ item.label }}
        </router-link>
      </nav>
      <div class="gda-sidebar-footer">
        <div class="gda-avatar">{{ initials }}</div>
        <div class="gda-user">
          <div class="gda-user-name">{{ auth.user?.fullName }}</div>
          <div class="gda-user-role">{{ roleLabel }}</div>
        </div>
        <q-btn flat dense round icon="logout" class="gda-logout" @click="logout">
          <q-tooltip>Cerrar sesión</q-tooltip>
        </q-btn>
      </div>
    </aside>

    <div class="gda-main">
      <header v-if="$q.screen.lt.md" class="gda-mobile-header">
        <div class="gda-brand gda-brand--mobile">
          <BrandMark :size="22" class="gda-brand-mark" />
          <span class="gda-brand-name">GDA</span>
        </div>
        <q-btn flat dense round icon="logout" class="gda-logout" @click="logout" />
      </header>

      <main class="gda-content"><router-view /></main>

      <nav v-if="$q.screen.lt.md" class="gda-mobile-tabs">
        <router-link
          v-for="item in navItems" :key="item.path"
          :to="item.path"
          class="gda-tab"
          :class="{ active: isActive(item.path) }"
        >
          <q-icon :name="item.icon" size="22px" />
          <span>{{ item.label }}</span>
        </router-link>
      </nav>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import BrandMark from '../components/BrandMark.vue';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const ROLE_LABELS = { admin: 'Administrador', tecnico: 'Técnico', visualizador: 'Visualizador' };
const roleLabel = computed(() => ROLE_LABELS[auth.user?.role] || '');

const initials = computed(() =>
  (auth.user?.fullName || '?')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
);

const navItems = computed(() => {
  const items = [
    { path: '/dashboard', label: 'Dashboard', icon: 'space_dashboard' },
    { path: '/dashboard/pots', label: 'Macetas', icon: 'potted_plant' },
    { path: '/dashboard/alerts', label: 'Alertas', icon: 'notifications' },
    { path: '/dashboard/settings', label: 'Ajustes', icon: 'settings' }
  ];
  if (auth.user?.role === 'admin') {
    items.splice(3, 0, { path: '/dashboard/users', label: 'Usuarios', icon: 'group' });
  }
  return items;
});

function isActive(path) {
  if (path === '/dashboard') return route.path === '/dashboard';
  return route.path.startsWith(path);
}

function logout() {
  auth.logout();
  router.push('/login');
}
</script>

<style scoped>
.gda-shell { display: flex; min-height: 100vh; }

/* Sidebar: sombra de follaje — panel verde pino con acentos hoja-clara */
.gda-sidebar {
  width: 232px;
  flex-shrink: 0;
  background: linear-gradient(180deg, var(--gda-pine) 0%, var(--gda-pine-deep) 100%);
  color: #E9F1E7;
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: 100vh;
}

.gda-brand {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 22px 20px 18px;
}
.gda-brand-mark { color: var(--gda-leaf-bright); flex-shrink: 0; }
.gda-brand-name {
  display: block;
  font-family: var(--gda-font-display);
  font-size: 19px;
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1.1;
}
.gda-brand-sub {
  display: block;
  font-size: 10px;
  letter-spacing: 0.05em;
  color: rgba(233, 241, 231, 0.55);
}

.gda-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
}
.gda-nav-link {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 12px;
  border-radius: 9px;
  border-left: 3px solid transparent;
  color: rgba(233, 241, 231, 0.72);
  text-decoration: none;
  font-size: 13.5px;
  font-weight: 500;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.gda-nav-link:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
.gda-nav-link.active {
  background: rgba(127, 201, 143, 0.14);
  border-left-color: var(--gda-leaf-bright);
  color: #fff;
  font-weight: 600;
}
.gda-nav-link.active .q-icon { color: var(--gda-leaf-bright); }

.gda-sidebar-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.09);
}
.gda-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--gda-leaf);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12.5px;
  font-weight: 700;
  flex-shrink: 0;
}
.gda-user { flex: 1; min-width: 0; }
.gda-user-name {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gda-user-role { font-size: 11px; color: rgba(233, 241, 231, 0.55); }
.gda-logout { color: rgba(233, 241, 231, 0.6); }

.gda-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.gda-content { flex: 1; padding-bottom: 72px; }

.gda-mobile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--gda-pine);
  color: #E9F1E7;
  position: sticky;
  top: 0;
  z-index: 10;
}
.gda-brand--mobile { padding: 0; gap: 8px; }

.gda-mobile-tabs {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  background: var(--gda-card);
  border-top: 1px solid var(--gda-hairline);
  z-index: 10;
}
.gda-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px 9px;
  font-size: 10.5px;
  color: var(--gda-ink-soft);
  text-decoration: none;
}
.gda-tab.active { color: var(--gda-leaf); font-weight: 700; }
</style>
