<template>
  <div class="gda-shell">
    <aside class="gda-sidebar" v-if="!$q.screen.lt.md">
      <div class="gda-brand">
        <div class="gda-brand-tile"><BrandMark :size="24" /></div>
        <div>
          <span class="gda-brand-name">GDA</span>
          <span class="gda-brand-sub">Gemelo Digital Agrícola</span>
        </div>
      </div>

      <nav class="gda-nav" aria-label="Secciones">
        <div v-for="group in navGroups" :key="group.label" class="gda-nav-group">
          <span class="gda-nav-group-label">{{ group.label }}</span>
          <router-link
            v-for="item in group.items" :key="item.path"
            :to="item.path"
            class="gda-nav-link"
            :class="{ active: isActive(item.path) }"
          >
            <q-icon :name="item.icon" size="20px" />
            <span>{{ item.label }}</span>
          </router-link>
        </div>
      </nav>

      <div class="gda-sidebar-footer">
        <div class="gda-avatar">{{ initials }}</div>
        <div class="gda-user">
          <div class="gda-user-name">{{ auth.user?.fullName }}</div>
          <div class="gda-user-role">{{ roleLabel }}</div>
        </div>
        <q-btn flat dense round icon="logout" class="gda-logout" aria-label="Cerrar sesión" @click="logout">
          <q-tooltip>Cerrar sesión</q-tooltip>
        </q-btn>
      </div>
    </aside>

    <div class="gda-main">
      <header v-if="$q.screen.lt.md" class="gda-mobile-header">
        <div class="gda-brand-mobile">
          <div class="gda-brand-tile gda-brand-tile--sm"><BrandMark :size="18" /></div>
          <span class="gda-mobile-title">{{ currentTitle }}</span>
        </div>
        <q-btn flat dense round icon="logout" class="gda-logout" aria-label="Cerrar sesión" @click="logout" />
      </header>

      <main class="gda-content"><router-view /></main>

      <nav v-if="$q.screen.lt.md" class="gda-mobile-tabs" aria-label="Secciones">
        <router-link
          v-for="item in navItems" :key="item.path"
          :to="item.path"
          class="gda-tab"
          :class="{ active: isActive(item.path) }"
        >
          <span class="gda-tab-icon"><q-icon :name="item.icon" size="22px" /></span>
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

const navGroups = computed(() => {
  const operacion = [
    { path: '/dashboard', label: 'Dashboard', icon: 'space_dashboard' },
    { path: '/dashboard/pots', label: 'Zonas', icon: 'grass' },
    { path: '/dashboard/alerts', label: 'Alertas', icon: 'notifications' }
  ];
  const cuenta = [{ path: '/dashboard/settings', label: 'Ajustes', icon: 'tune' }];
  if (auth.user?.role === 'admin') {
    cuenta.unshift({ path: '/dashboard/users', label: 'Usuarios', icon: 'group' });
  }
  return [
    { label: 'Operación', items: operacion },
    { label: 'Administración', items: cuenta }
  ];
});
const navItems = computed(() => navGroups.value.flatMap(g => g.items));

function isActive(path) {
  if (path === '/dashboard') return route.path === '/dashboard';
  return route.path.startsWith(path);
}

const currentTitle = computed(() => {
  const item = [...navItems.value].reverse().find(i => isActive(i.path));
  return item?.label || 'GDA';
});

function logout() {
  auth.logout();
  router.push('/login');
}
</script>

<style scoped>
.gda-shell { display: flex; min-height: 100vh; }

/* Sidebar: panel verde pino de instrumento, con acentos hoja-clara */
.gda-sidebar {
  width: 248px;
  flex-shrink: 0;
  background: var(--gda-pine-deep);
  color: #E9F1E7;
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: 100vh;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}

.gda-brand { display: flex; align-items: center; gap: 12px; padding: 22px 20px 20px; }
.gda-brand-tile {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  background: rgba(127, 201, 143, 0.14);
  color: var(--gda-leaf-bright);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.gda-brand-tile--sm { width: 32px; height: 32px; border-radius: 9px; }
.gda-brand-name {
  display: block;
  font-family: var(--gda-font-display);
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.05em;
  line-height: 1.1;
}
.gda-brand-sub { display: block; font-size: 10.5px; letter-spacing: 0.04em; color: rgba(233, 241, 231, 0.55); margin-top: 2px; }

.gda-nav { flex: 1; display: flex; flex-direction: column; gap: 20px; padding: 8px 14px; overflow-y: auto; }
.gda-nav-group { display: flex; flex-direction: column; gap: 2px; }
.gda-nav-group-label {
  font-family: var(--gda-font-mono);
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(233, 241, 231, 0.42);
  padding: 0 12px 8px;
}
.gda-nav-link {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  color: rgba(233, 241, 231, 0.72);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.gda-nav-link:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
.gda-nav-link.active { background: rgba(127, 201, 143, 0.15); color: #fff; font-weight: 600; }
.gda-nav-link.active .q-icon { color: var(--gda-leaf-bright); }
/* LED de la sección activa */
.gda-nav-link.active::after {
  content: '';
  position: absolute;
  right: 12px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--gda-leaf-bright);
  box-shadow: 0 0 8px rgba(127, 201, 143, 0.7);
}

.gda-sidebar-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 14px 14px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
}
.gda-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--gda-leaf);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}
.gda-user { flex: 1; min-width: 0; }
.gda-user-name { font-size: 13px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gda-user-role { font-size: 11.5px; color: rgba(233, 241, 231, 0.6); }
.gda-logout { color: rgba(233, 241, 231, 0.65); }

.gda-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.gda-content { flex: 1; }

.gda-mobile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--gda-pine-deep);
  color: #E9F1E7;
  position: sticky;
  top: 0;
  z-index: 10;
}
.gda-brand-mobile { display: flex; align-items: center; gap: 10px; }
.gda-mobile-title { font-family: var(--gda-font-display); font-size: 17px; font-weight: 700; }

.gda-mobile-tabs {
  position: sticky;
  bottom: 0;
  display: flex;
  background: var(--gda-card);
  border-top: 1px solid var(--gda-hairline);
  z-index: 10;
  padding-bottom: env(safe-area-inset-bottom);
}
.gda-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 4px 9px;
  font-size: 11px;
  font-weight: 500;
  color: var(--gda-ink-soft);
  text-decoration: none;
}
.gda-tab-icon { width: 54px; height: 28px; border-radius: 14px; display: grid; place-items: center; transition: background-color 0.15s ease; }
.gda-tab.active { color: var(--gda-leaf); font-weight: 700; }
.gda-tab.active .gda-tab-icon { background: var(--gda-leaf-tint); }
</style>
