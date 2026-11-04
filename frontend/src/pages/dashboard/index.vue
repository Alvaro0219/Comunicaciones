<template>
  <div class="gda-page-shell">
    <PageHeader
      title="Dashboard" icon="space_dashboard"
      subtitle="Estado en vivo de tus zonas de riego"
    >
      <StatusChip
        :tone="connected ? 'ok' : 'neutral'"
        :label="connected ? 'En vivo' : 'Reconectando…'"
      />
      <q-btn flat no-caps color="primary" icon="refresh" label="Actualizar" @click="reload" />
    </PageHeader>

    <LoadingState
      :loading="loading"
      :empty="!loading && pots.length === 0"
      empty-label="Todavía no hay zonas. Creá la primera desde la sección Zonas."
      empty-icon="grass"
    >
      <div class="gda-summary" role="list" aria-label="Resumen de zonas">
        <div class="gda-summary-item" role="listitem">
          <span class="gda-summary-led gda-summary-led--ok" />
          <div class="gda-summary-text">
            <span class="gda-summary-value gda-summary-value--ok">{{ summary.ok }}</span>
            <span class="gda-label">En rango</span>
          </div>
        </div>
        <div class="gda-summary-item" role="listitem">
          <span class="gda-summary-led gda-summary-led--attention" />
          <div class="gda-summary-text">
            <span class="gda-summary-value gda-summary-value--attention">{{ summary.attention }}</span>
            <span class="gda-label">Requieren atención</span>
          </div>
        </div>
        <div class="gda-summary-item" role="listitem">
          <span class="gda-summary-led" />
          <div class="gda-summary-text">
            <span class="gda-summary-value">{{ summary.offline }}</span>
            <span class="gda-label">Sin conexión</span>
          </div>
        </div>
        <div class="gda-summary-item" role="listitem">
          <span class="gda-summary-led gda-summary-led--water" />
          <div class="gda-summary-text">
            <span class="gda-summary-value">{{ summary.plants }}</span>
            <span class="gda-label">Macetas en total</span>
          </div>
        </div>
      </div>

      <div class="gda-toolbar">
        <SegmentedControl
          v-model="filter" label="Filtrar zonas"
          :options="[
            { label: 'Todas', value: 'all', count: pots.length },
            { label: 'Atención', value: 'attention', count: summary.attention },
            { label: 'Sin conexión', value: 'offline', count: summary.offline }
          ]"
        />
        <q-input v-model="search" dense outlined clearable placeholder="Buscar zona o especie" class="gda-search">
          <template #prepend><q-icon name="search" /></template>
        </q-input>
      </div>

      <div v-if="visible.length" class="gda-grid">
        <PotCard
          v-for="pot in visible" :key="pot._id"
          :pot="pot"
          :can-operate="auth.canOperate"
          @open="goToDetail"
          @irrigate="askIrrigate"
        />
      </div>
      <div v-else class="app-empty-state">
        <q-icon name="filter_alt_off" size="40px" color="grey-5" />
        <span>Ninguna zona coincide con el filtro.</span>
      </div>
    </LoadingState>

    <!-- Riego manual -->
    <AppDialog
      v-model="showIrrigate" title="Riego manual" :subtitle="irrigateTarget?.name"
      icon="water_drop" tone="water" width="420px"
      submit-label="Regar ahora" :loading="irrigating" @submit="doIrrigate"
    >
      <section class="gda-form-section">
        <q-input
          v-model.number="irrigateDuration" type="number" outlined
          label="Duración del riego" suffix="seg" :min="1" :max="600"
          hint="El nodo nunca riega más de 120 segundos por orden"
        >
          <template #prepend><q-icon name="timer" /></template>
        </q-input>
      </section>
    </AppDialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '../../stores/auth.js';
import { fetchPots, irrigatePot } from '../../services/api.js';
import { useRealtimeStream } from '../../composables/useRealtimeStream.js';
import { potState, needsAttention } from '../../utils/potState.js';
import LoadingState from '../../components/LoadingState.vue';
import PotCard from '../../components/PotCard.vue';
import PageHeader from '../../components/PageHeader.vue';
import StatusChip from '../../components/StatusChip.vue';
import SegmentedControl from '../../components/SegmentedControl.vue';
import AppDialog from '../../components/AppDialog.vue';

const $q = useQuasar();
const router = useRouter();
const auth = useAuthStore();

const pots = ref([]);
const loading = ref(false);
const filter = ref('all');
const search = ref('');

const showIrrigate = ref(false);
const irrigateTarget = ref(null);
const irrigateDuration = ref(5);
const irrigating = ref(false);

// Una zona "requiere atención" si tiene alertas activas o la humedad está fuera de sus límites
const summary = computed(() => {
  const s = { ok: 0, attention: 0, offline: 0, plants: 0 };
  for (const p of pots.value) {
    s.plants += p.plants?.length || 0;
    if (!p.online) s.offline++;
    else if (needsAttention(p)) s.attention++;
    else s.ok++;
  }
  return s;
});

// Primero las zonas reales, después las que necesitan atención; al final las sin conexión
const ORDER = { dry: 0, wet: 1, watering: 2, ok: 3, wait: 4, offline: 5 };
const visible = computed(() => {
  const q = (search.value || '').trim().toLowerCase();
  return pots.value
    .filter((p) => {
      if (filter.value === 'attention' && !needsAttention(p)) return false;
      if (filter.value === 'offline' && p.online) return false;
      if (!q) return true;
      return `${p.name} ${p.species || ''}`.toLowerCase().includes(q);
    })
    .sort((a, b) => (a.isDemo ? 1 : 0) - (b.isDemo ? 1 : 0) || (ORDER[potState(a).key] ?? 9) - (ORDER[potState(b).key] ?? 9));
});

async function reload() {
  loading.value = true;
  try {
    // El dashboard muestra solo zonas activas; la gestión completa vive en /pots
    pots.value = (await fetchPots({ limit: 100, active: 'true' })).items || [];
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudieron cargar las zonas' });
  } finally {
    loading.value = false;
  }
}

onMounted(reload);

function potById(id) {
  return pots.value.find(p => String(p._id) === String(id));
}

// Actualizaciones en tiempo real vía SSE
const { connected } = useRealtimeStream({
  reading(data) {
    const pot = potById(data.potId);
    if (!pot) return;
    pot.online = true;
    pot.lastReading = {
      soilMoisture: data.soilMoisture,
      temperature: data.temperature,
      airHumidity: data.airHumidity,
      measuredAt: data.measuredAt,
      source: data.source
    };
  },
  pot_status(data) {
    const pot = potById(data.potId);
    if (!pot) return;
    if (data.online !== undefined) pot.online = data.online;
    if (data.watering !== undefined) pot.watering = data.watering;
    if (data.lastIrrigation !== undefined) pot.lastIrrigation = data.lastIrrigation;
  },
  event(data) {
    if (data.result === 'confirmado') {
      $q.notify({ type: 'positive', message: `${data.potName}: riego confirmado` });
    } else if (data.result === 'fallido') {
      $q.notify({ type: 'negative', message: `${data.potName}: el riego falló` });
    }
  },
  alert(data) {
    const pot = potById(data.potId);
    if (pot) pot.activeAlerts = (pot.activeAlerts || 0) + 1;
    $q.notify({ type: 'warning', message: `Alerta en ${data.potName}: ${data.message}`, timeout: 6000 });
  },
  alert_resolved(data) {
    const pot = potById(data.potId);
    if (pot) pot.activeAlerts = Math.max(0, (pot.activeAlerts || 0) - data.types.length);
  }
});

function goToDetail(pot) {
  router.push(`/dashboard/pots/${pot._id}`);
}

function askIrrigate(pot) {
  irrigateTarget.value = pot;
  irrigateDuration.value = pot.irrigationDurationSec || 5;
  showIrrigate.value = true;
}

async function doIrrigate() {
  irrigating.value = true;
  try {
    await irrigatePot(irrigateTarget.value._id, irrigateDuration.value);
    $q.notify({ type: 'info', message: 'Orden de riego enviada al nodo' });
    showIrrigate.value = false;
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudo enviar la orden' });
  } finally {
    irrigating.value = false;
  }
}
</script>
