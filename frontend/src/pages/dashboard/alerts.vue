<template>
  <div class="gda-page-shell">
    <PageHeader title="Alertas" icon="notifications" subtitle="Avisos del sistema: qué pasó, en qué zona y si ya se resolvió">
      <SegmentedControl
        v-model="statusFilter" label="Estado de las alertas"
        :options="[
          { label: 'Activas', value: 'activa' },
          { label: 'Resueltas', value: 'resuelta' },
          { label: 'Todas', value: '' }
        ]"
        @update:model-value="reload"
      />
    </PageHeader>

    <div class="gda-panel">
      <LoadingState :loading="loading" :empty="!loading && items.length === 0" empty-label="No hay alertas para mostrar." empty-icon="notifications_off">
        <ul class="gda-alert-list">
          <li v-for="alert in items" :key="alert._id" class="gda-alert" :class="`gda-alert--${meta(alert.type).tone}`">
            <div class="gda-alert-icon"><q-icon :name="meta(alert.type).icon" size="22px" /></div>
            <div class="gda-alert-body">
              <div class="gda-alert-top">
                <StatusChip :tone="meta(alert.type).tone" :label="meta(alert.type).label" />
                <StatusChip
                  :tone="alert.status === 'activa' ? 'crit' : 'neutral'"
                  :label="alert.status === 'activa' ? 'Activa' : 'Resuelta'"
                  :dot="alert.status === 'activa'" :icon="alert.status === 'activa' ? '' : 'check'"
                />
              </div>
              <p class="gda-alert-msg">{{ alert.message }}</p>
              <p class="gda-alert-meta">
                <span class="gda-alert-zone"><q-icon name="grass" size="14px" /> {{ alert.potId?.name || 'Zona' }}</span>
                <span class="gda-mono">{{ fmtDate(alert.createdAt) }}</span>
                <span v-if="alert.status === 'resuelta'" class="gda-mono">resuelta {{ fmtDate(alert.resolvedAt) }}</span>
              </p>
            </div>
            <div v-if="alert.status === 'activa' && auth.canOperate" class="gda-alert-action">
              <q-btn outline no-caps dense color="primary" icon="done" label="Resolver" @click="doResolve(alert)" />
            </div>
          </li>
        </ul>
      </LoadingState>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { useAuthStore } from '../../stores/auth.js';
import { fetchAlerts, resolveAlert } from '../../services/api.js';
import { useRealtimeStream } from '../../composables/useRealtimeStream.js';
import LoadingState from '../../components/LoadingState.vue';
import PageHeader from '../../components/PageHeader.vue';
import StatusChip from '../../components/StatusChip.vue';
import SegmentedControl from '../../components/SegmentedControl.vue';

const $q = useQuasar();
const auth = useAuthStore();

const items = ref([]);
const loading = ref(false);
const statusFilter = ref('activa');

const TYPE_META = {
  critica: { label: 'Crítica', icon: 'error', tone: 'crit' },
  preventiva: { label: 'Preventiva', icon: 'cloud', tone: 'water' },
  calor_extremo: { label: 'Calor extremo', icon: 'local_fire_department', tone: 'warn' },
  fallo_sensor: { label: 'Fallo de sensor', icon: 'sensors_off', tone: 'neutral' },
  exceso_humedad: { label: 'Exceso de humedad', icon: 'water', tone: 'water' }
};

function meta(t) { return TYPE_META[t] || { label: t, icon: 'warning', tone: 'warn' }; }
function fmtDate(d) {
  return new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function reload() {
  loading.value = true;
  try {
    const params = { limit: 100 };
    if (statusFilter.value) params.status = statusFilter.value;
    const res = await fetchAlerts(params);
    items.value = res.items || [];
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudieron cargar las alertas' });
  } finally {
    loading.value = false;
  }
}

onMounted(reload);

useRealtimeStream({
  alert() { reload(); },
  alert_resolved() { reload(); }
});

async function doResolve(alert) {
  try {
    await resolveAlert(alert._id);
    $q.notify({ type: 'positive', message: 'Alerta resuelta' });
    reload();
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudo resolver la alerta' });
  }
}
</script>

<style scoped>
.gda-alert-list { list-style: none; margin: 0; padding: 0; }
.gda-alert {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 20px;
  border-top: 1px solid var(--gda-hairline);
}
.gda-alert:first-child { border-top: 0; }
.gda-alert-icon {
  width: 42px;
  height: 42px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: var(--gda-mist);
  color: var(--gda-ink-soft);
}
.gda-alert--crit .gda-alert-icon { background: var(--gda-clay-tint); color: var(--gda-clay); }
.gda-alert--water .gda-alert-icon { background: var(--gda-water-tint); color: var(--gda-water); }
.gda-alert--warn .gda-alert-icon { background: #F7ECD9; color: var(--gda-sun); }
.gda-alert-body { flex: 1; min-width: 0; }
.gda-alert-top { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.gda-alert-msg { margin: 0; font-size: 14.5px; line-height: 1.5; color: var(--gda-ink); }
.gda-alert-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--gda-ink-soft);
}
.gda-alert-zone { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; color: var(--gda-ink); }
.gda-alert-action { flex-shrink: 0; }

@media (max-width: 599px) {
  .gda-alert { flex-wrap: wrap; padding: 16px; }
  .gda-alert-body { flex-basis: calc(100% - 60px); }
  .gda-alert-action { width: 100%; padding-left: 58px; }
}
</style>
