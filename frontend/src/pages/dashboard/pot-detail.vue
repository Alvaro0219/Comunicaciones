<template>
  <div class="gda-page-shell">
    <LoadingState :loading="loadingPot" :empty="!loadingPot && !pot" empty-label="Maceta no encontrada.">
      <div v-if="pot">
        <div class="gda-page-header">
          <div>
            <h1 class="gda-page-title">
              {{ pot.name }}
              <q-badge :color="pot.online ? 'positive' : 'grey-5'" :label="pot.online ? 'online' : 'offline'" class="q-ml-sm" />
            </h1>
            <p class="gda-page-subtitle">
              Nodo {{ pot.nodeId }}
              <span v-if="pot.location?.label"> · {{ pot.location.label }}</span>
            </p>
          </div>
          <div class="q-gutter-x-sm">
            <q-btn flat icon="arrow_back" label="Volver" @click="$router.back()" />
            <q-btn
              v-if="auth.canOperate"
              color="info" icon="water_drop" label="Regar ahora"
              :disable="!pot.online || pot.watering?.active"
              @click="doIrrigate"
              :loading="irrigating"
            />
          </div>
        </div>

        <!-- Estado actual -->
        <div class="row q-col-gutter-md q-mb-md">
          <div class="col-12 col-md-8">
            <div class="gda-section-card">
              <div class="gda-card-title">Estado actual</div>
              <div v-if="pot.lastReading?.measuredAt" class="gda-current">
                <div class="gda-metric">
                  <span class="gda-metric-value">{{ round(pot.lastReading.soilMoisture) }}%</span>
                  <span class="gda-metric-label">Humedad suelo (umbral {{ pot.minMoisture }}–{{ pot.maxMoisture }}%)</span>
                </div>
                <div class="gda-metric">
                  <span class="gda-metric-value">{{ round(pot.lastReading.temperature) }}°C</span>
                  <span class="gda-metric-label">Temperatura</span>
                </div>
                <div class="gda-metric">
                  <span class="gda-metric-value">{{ round(pot.lastReading.airHumidity) }}%</span>
                  <span class="gda-metric-label">Humedad aire</span>
                </div>
                <div class="gda-metric">
                  <span class="gda-metric-value">
                    <q-spinner-rings v-if="pot.watering?.active" color="info" size="22px" />
                    {{ pot.watering?.active ? 'Regando' : 'Inactivo' }}
                  </span>
                  <span class="gda-metric-label">
                    {{ pot.lastIrrigation?.at
                      ? `Último riego: ${fmtDate(pot.lastIrrigation.at)} (${pot.lastIrrigation.durationSec}s)`
                      : 'Sin riegos registrados' }}
                  </span>
                </div>
              </div>
              <div v-else class="text-grey-6">Sin lecturas todavía.</div>
              <MoistureBand
                class="q-mt-lg"
                :value="pot.lastReading?.soilMoisture ?? null"
                :min="pot.minMoisture"
                :max="pot.maxMoisture"
              />
              <div v-if="pot.lastReading?.measuredAt" class="gda-last-update">
                Última lectura: {{ fmtDate(pot.lastReading.measuredAt) }}
                <q-badge v-if="pot.lastReading.source === 'replay'" color="orange" label="retransmitida" class="q-ml-xs" />
              </div>
            </div>
          </div>
          <div class="col-12 col-md-4">
            <div class="gda-section-card">
              <div class="gda-card-title">Nodo</div>
              <div class="gda-cred"><span>Node ID:</span> <code>{{ pot.nodeId }}</code></div>
              <template v-if="pot.diagnostics?.at">
                <div class="gda-cred"><span>Red:</span> <code>{{ pot.diagnostics.ssid || '—' }}</code></div>
                <div class="gda-cred">
                  <span>IP (para OTA/Telnet):</span> <code>{{ pot.diagnostics.ip || '—' }}</code>
                </div>
                <div class="gda-cred">
                  <span>Señal:</span>
                  <code>{{ pot.diagnostics.rssi }} dBm</code>
                  <q-badge
                    :color="rssiQuality.color" :label="rssiQuality.label"
                    class="q-ml-xs" outline
                  />
                </div>
                <div class="gda-cred"><span>RAM libre:</span> <code>{{ formatHeap(pot.diagnostics.heap) }}</code></div>
              </template>
              <div class="text-caption text-grey-6 q-mt-xs">
                La autenticación MQTT del nodo se gestiona en el broker (HiveMQ) —
                ver el documento interno del equipo.
              </div>
            </div>
          </div>
        </div>

        <!-- Pronóstico 5 días -->
        <div class="gda-section-card q-mb-md">
          <div class="gda-card-title">Pronóstico a 5 días</div>
          <ForecastStrip v-if="forecast?.daily?.length" :daily="forecast.daily" />
          <div v-else class="text-grey-6 text-caption">
            {{ pot.location?.lat != null ? 'Pronóstico no disponible.' : 'Configurá la ubicación de la maceta para ver el pronóstico.' }}
          </div>
        </div>

        <!-- Histórico 24h -->
        <div class="gda-section-card q-mb-md">
          <div class="gda-card-title">Últimas 24 horas</div>
          <HistoryChart :readings="recent" />
        </div>

        <!-- Historial: eventos y alertas con filtro de fechas -->
        <div class="gda-section-card">
          <div class="gda-history-head">
            <div class="gda-card-title">Historial</div>
            <div class="row q-gutter-x-sm items-center">
              <q-input v-model="fromDate" type="date" dense outlined label="Desde" style="width: 150px" />
              <q-input v-model="toDate" type="date" dense outlined label="Hasta" style="width: 150px" />
              <q-btn flat dense color="primary" icon="search" @click="loadHistory" />
            </div>
          </div>

          <q-tabs v-model="tab" dense align="left" active-color="primary" class="q-mb-sm">
            <q-tab name="events" label="Eventos de riego" />
            <q-tab name="readings" label="Lecturas" />
            <q-tab name="alerts" label="Alertas" />
          </q-tabs>

          <q-tab-panels v-model="tab" animated>
            <q-tab-panel name="events" class="q-pa-none">
              <q-table
                :rows="events" :columns="eventColumns" row-key="_id" flat dense
                :loading="loadingHistory" :pagination="{ rowsPerPage: 15 }"
                no-data-label="Sin eventos en el período."
              />
            </q-tab-panel>
            <q-tab-panel name="readings" class="q-pa-none">
              <q-table
                :rows="readings" :columns="readingColumns" row-key="_id" flat dense
                :loading="loadingHistory" :pagination="{ rowsPerPage: 15 }"
                no-data-label="Sin lecturas en el período."
              />
            </q-tab-panel>
            <q-tab-panel name="alerts" class="q-pa-none">
              <q-table
                :rows="alerts" :columns="alertColumns" row-key="_id" flat dense
                :loading="loadingHistory" :pagination="{ rowsPerPage: 15 }"
                no-data-label="Sin alertas en el período."
              />
            </q-tab-panel>
          </q-tab-panels>
        </div>
      </div>
    </LoadingState>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '../../stores/auth.js';
import {
  fetchPot, fetchPotWeather, fetchRecentReadings, fetchReadings, fetchPotEvents, fetchAlerts, irrigatePot
} from '../../services/api.js';
import { useRealtimeStream } from '../../composables/useRealtimeStream.js';
import LoadingState from '../../components/LoadingState.vue';
import HistoryChart from '../../components/HistoryChart.vue';
import ForecastStrip from '../../components/ForecastStrip.vue';
import MoistureBand from '../../components/MoistureBand.vue';

const $q = useQuasar();
const route = useRoute();
const auth = useAuthStore();
const potId = route.params.id;

const pot = ref(null);
const forecast = ref(null);
const recent = ref([]);
const loadingPot = ref(true);
const irrigating = ref(false);

const tab = ref('events');
const fromDate = ref('');
const toDate = ref('');
const events = ref([]);
const readings = ref([]);
const alerts = ref([]);
const loadingHistory = ref(false);

const EVENT_LABELS = {
  riego_activado: 'Riego automático',
  riego_pospuesto: 'Riego pospuesto',
  riego_no_aplicado: 'No aplicado',
  riego_calor: 'Riego por calor',
  riego_manual: 'Riego manual'
};

const eventColumns = [
  { name: 'createdAt', label: 'Fecha', field: 'createdAt', align: 'left', format: fmtDate },
  { name: 'type', label: 'Tipo', field: 'type', align: 'left', format: v => EVENT_LABELS[v] || v },
  { name: 'origin', label: 'Origen', field: 'origin', align: 'center', format: v => v === 'manual' ? 'Manual' : 'Automático' },
  { name: 'durationSec', label: 'Duración', field: 'durationSec', align: 'center', format: v => v ? `${v}s` : '—' },
  { name: 'result', label: 'Resultado', field: 'result', align: 'center' },
  { name: 'message', label: 'Detalle', field: 'message', align: 'left' }
];

const readingColumns = [
  { name: 'measuredAt', label: 'Medición', field: 'measuredAt', align: 'left', format: fmtDate },
  { name: 'soilMoisture', label: 'Hum. suelo', field: 'soilMoisture', align: 'center', format: v => `${v}%` },
  { name: 'temperature', label: 'Temp.', field: 'temperature', align: 'center', format: v => `${v}°C` },
  { name: 'airHumidity', label: 'Hum. aire', field: 'airHumidity', align: 'center', format: v => `${v}%` },
  { name: 'source', label: 'Fuente', field: 'source', align: 'center', format: v => v === 'replay' ? 'retransmitida' : 'en vivo' },
  { name: 'status', label: 'Estado', field: 'status', align: 'center' }
];

const alertColumns = [
  { name: 'createdAt', label: 'Fecha', field: 'createdAt', align: 'left', format: fmtDate },
  { name: 'type', label: 'Tipo', field: 'type', align: 'left' },
  { name: 'status', label: 'Estado', field: 'status', align: 'center' },
  { name: 'message', label: 'Mensaje', field: 'message', align: 'left' }
];

function round(v) { return v == null ? '–' : Math.round(v * 10) / 10; }

// Interpretación del RSSI según la tabla del equipo (GDA Guia Setup)
const rssiQuality = computed(() => {
  const rssi = pot.value?.diagnostics?.rssi;
  if (rssi == null) return { label: '—', color: 'grey' };
  if (rssi >= -60) return { label: 'excelente', color: 'positive' };
  if (rssi >= -70) return { label: 'buena', color: 'primary' };
  if (rssi >= -80) return { label: 'justa', color: 'warning' };
  return { label: 'muy débil', color: 'negative' };
});

function formatHeap(bytes) {
  return bytes == null ? '—' : `${Math.round(bytes / 1024)} KB`;
}
function fmtDate(d) {
  return new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function dateParams() {
  const params = {};
  if (fromDate.value) params.from = new Date(`${fromDate.value}T00:00:00`).toISOString();
  if (toDate.value) params.to = new Date(`${toDate.value}T23:59:59`).toISOString();
  return params;
}

async function loadHistory() {
  loadingHistory.value = true;
  try {
    const params = { ...dateParams(), limit: 100 };
    const [ev, rd, al] = await Promise.all([
      fetchPotEvents(potId, params),
      fetchReadings(potId, params),
      fetchAlerts({ ...params, potId, limit: 100 })
    ]);
    events.value = ev.items || [];
    readings.value = rd.items || [];
    alerts.value = al.items || [];
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudo cargar el historial' });
  } finally {
    loadingHistory.value = false;
  }
}

async function load() {
  loadingPot.value = true;
  try {
    pot.value = await fetchPot(potId);
    recent.value = await fetchRecentReadings(potId, 24);
    if (pot.value.location?.lat != null) {
      fetchPotWeather(potId).then(f => { forecast.value = f; }).catch(() => {});
    }
    await loadHistory();
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudo cargar la maceta' });
  } finally {
    loadingPot.value = false;
  }
}

onMounted(load);

useRealtimeStream({
  reading(data) {
    if (String(data.potId) !== String(potId)) return;
    if (pot.value) {
      pot.value.online = true;
      pot.value.lastReading = data;
    }
    if (data.status === 'valida') {
      recent.value.push(data);
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      recent.value = recent.value.filter(r => new Date(r.measuredAt).getTime() >= cutoff);
    }
  },
  pot_status(data) {
    if (String(data.potId) !== String(potId) || !pot.value) return;
    if (data.online !== undefined) pot.value.online = data.online;
    if (data.watering !== undefined) pot.value.watering = data.watering;
    if (data.lastIrrigation !== undefined) pot.value.lastIrrigation = data.lastIrrigation;
    if (data.diagnostics !== undefined) pot.value.diagnostics = data.diagnostics;
  },
  event(data) {
    if (String(data.potId) !== String(potId)) return;
    events.value.unshift(data);
  },
  alert(data) {
    if (String(data.potId) !== String(potId)) return;
    alerts.value.unshift(data);
    $q.notify({ type: 'warning', message: data.message, timeout: 6000 });
  }
});

async function doIrrigate() {
  irrigating.value = true;
  try {
    await irrigatePot(potId, pot.value.irrigationDurationSec);
    $q.notify({ type: 'info', message: 'Orden de riego enviada al nodo' });
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudo enviar la orden' });
  } finally {
    irrigating.value = false;
  }
}
</script>

<style scoped>
.gda-current { display: flex; gap: 32px; flex-wrap: wrap; }
.gda-last-update { margin-top: 14px; font-size: 12px; color: var(--gda-ink-soft); }
.gda-cred { font-size: 13px; color: var(--gda-ink-soft); margin-bottom: 5px; }
.gda-cred code {
  font-family: var(--gda-font-mono);
  background: var(--gda-mist);
  border: 1px solid var(--gda-hairline);
  color: var(--gda-ink);
  padding: 2px 6px;
  border-radius: 5px;
  font-size: 11.5px;
  word-break: break-all;
}
.gda-history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 8px;
}
</style>
