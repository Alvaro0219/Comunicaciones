<template>
  <div class="gda-page-shell">
    <div class="gda-page-header">
      <div>
        <h1 class="gda-page-title">Dashboard</h1>
        <p class="gda-page-subtitle">
          Estado en vivo de tus zonas
          <q-badge :color="connected ? 'positive' : 'grey-5'" class="q-ml-sm">
            {{ connected ? 'en vivo' : 'reconectando…' }}
          </q-badge>
        </p>
      </div>
      <q-btn flat color="primary" icon="refresh" label="Actualizar" @click="reload" />
    </div>

    <LoadingState
      :loading="loading"
      :empty="!loading && pots.length === 0"
      empty-label="Todavía no hay zonas. Creá la primera desde la sección Zonas."
      empty-icon="grass"
    >
      <div class="gda-summary" role="list" aria-label="Resumen de zonas">
        <div class="gda-summary-item" role="listitem">
          <span class="gda-summary-value gda-summary-value--ok">{{ summary.ok }}</span>
          <span class="gda-metric-label">En rango</span>
        </div>
        <div class="gda-summary-item" role="listitem">
          <span class="gda-summary-value gda-summary-value--attention">{{ summary.attention }}</span>
          <span class="gda-metric-label">Requieren atención</span>
        </div>
        <div class="gda-summary-item" role="listitem">
          <span class="gda-summary-value">{{ summary.offline }}</span>
          <span class="gda-metric-label">Sin conexión</span>
        </div>
        <div class="gda-summary-item" role="listitem">
          <span class="gda-summary-value">{{ summary.plants }}</span>
          <span class="gda-metric-label">Macetas en total</span>
        </div>
      </div>
      <div class="gda-grid">
        <PotCard
          v-for="pot in pots" :key="pot._id"
          :pot="pot"
          :can-operate="auth.canOperate"
          @open="goToDetail"
          @irrigate="askIrrigate"
        />
      </div>
    </LoadingState>

    <!-- Diálogo de riego manual -->
    <q-dialog v-model="showIrrigate">
      <q-card style="width: 360px">
        <q-card-section>
          <div class="text-h6">Riego manual</div>
          <div class="text-caption text-grey-7">{{ irrigateTarget?.name }}</div>
        </q-card-section>
        <q-card-section>
          <q-input
            v-model.number="irrigateDuration" type="number" dense outlined
            label="Duración (segundos)" :min="1" :max="600"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn color="info" icon="water_drop" label="Regar" :loading="irrigating" @click="doIrrigate" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '../../stores/auth.js';
import { fetchPots, irrigatePot } from '../../services/api.js';
import { useRealtimeStream } from '../../composables/useRealtimeStream.js';
import LoadingState from '../../components/LoadingState.vue';
import PotCard from '../../components/PotCard.vue';

const $q = useQuasar();
const router = useRouter();
const auth = useAuthStore();

const pots = ref([]);

// Una zona "requiere atención" si tiene alertas activas o la humedad está fuera de sus límites
const summary = computed(() => {
  const s = { ok: 0, attention: 0, offline: 0, plants: 0 };
  for (const p of pots.value) {
    s.plants += p.plants?.length || 0;
    if (!p.online) { s.offline++; continue; }
    const soil = p.lastReading?.soilMoisture;
    const out = soil != null && (soil < p.minMoisture || soil > p.maxMoisture);
    if (p.activeAlerts || out) s.attention++;
    else s.ok++;
  }
  return s;
});
const loading = ref(false);

const showIrrigate = ref(false);
const irrigateTarget = ref(null);
const irrigateDuration = ref(5);
const irrigating = ref(false);

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
