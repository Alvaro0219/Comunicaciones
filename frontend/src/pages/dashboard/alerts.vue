<template>
  <div class="gda-page-shell">
    <div class="gda-page-header">
      <div>
        <h1 class="gda-page-title">Alertas</h1>
        <p class="gda-page-subtitle">Alertas activas e historial</p>
      </div>
      <q-btn-toggle
        v-model="statusFilter"
        :options="[
          { label: 'Activas', value: 'activa' },
          { label: 'Resueltas', value: 'resuelta' },
          { label: 'Todas', value: '' }
        ]"
        toggle-color="primary" unelevated dense
        @update:model-value="reload"
      />
    </div>

    <div class="gda-section-card">
      <LoadingState :loading="loading" :empty="!loading && items.length === 0" empty-label="No hay alertas." empty-icon="notifications_off">
        <q-list separator>
          <q-item v-for="alert in items" :key="alert._id">
            <q-item-section avatar>
              <q-icon :name="iconFor(alert.type)" :color="colorFor(alert.type)" size="26px" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ alert.message }}</q-item-label>
              <q-item-label caption>
                {{ alert.potId?.name || 'Maceta' }} · {{ typeLabel(alert.type) }} · {{ fmtDate(alert.createdAt) }}
                <span v-if="alert.status === 'resuelta'"> · resuelta {{ fmtDate(alert.resolvedAt) }}</span>
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-btn
                v-if="alert.status === 'activa' && auth.canOperate"
                flat dense color="primary" label="Resolver"
                @click="doResolve(alert)"
              />
              <q-badge v-else :color="alert.status === 'activa' ? 'negative' : 'grey-5'" :label="alert.status" />
            </q-item-section>
          </q-item>
        </q-list>
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

const $q = useQuasar();
const auth = useAuthStore();

const items = ref([]);
const loading = ref(false);
const statusFilter = ref('activa');

const TYPE_META = {
  critica: { label: 'Crítica', icon: 'error', color: 'negative' },
  preventiva: { label: 'Preventiva', icon: 'cloud', color: 'info' },
  calor_extremo: { label: 'Calor extremo', icon: 'local_fire_department', color: 'deep-orange' },
  fallo_sensor: { label: 'Fallo de sensor', icon: 'sensors_off', color: 'grey-7' },
  exceso_humedad: { label: 'Exceso de humedad', icon: 'water', color: 'blue' }
};

function typeLabel(t) { return TYPE_META[t]?.label || t; }
function iconFor(t) { return TYPE_META[t]?.icon || 'warning'; }
function colorFor(t) { return TYPE_META[t]?.color || 'warning'; }
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
