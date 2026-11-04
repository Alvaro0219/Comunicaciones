<template>
  <div class="gda-page-shell">
    <LoadingState :loading="loadingPot" :empty="!loadingPot && !pot" empty-label="Zona no encontrada.">
      <div v-if="pot">
        <PageHeader icon="grass">
          <template #title>
            {{ pot.name }}
          </template>
          <template #subtitle>
            <span class="gda-head-meta">
              <StatusChip :label="state.label" :tone="state.tone" />
              <span v-if="pot.species">{{ pot.species }}</span>
              <span v-if="pot.exposure === 'interior'">Interior</span>
              <span class="gda-mono">{{ pot.nodeId }}</span>
              <span v-if="pot.location?.label">{{ pot.location.label }}</span>
            </span>
          </template>
          <q-btn flat no-caps icon="arrow_back" label="Volver" color="grey-8" @click="$router.back()" />
          <q-btn
            v-if="auth.canOperate"
            unelevated no-caps color="secondary" icon="water_drop" label="Regar ahora"
            :disable="!pot.online || pot.watering?.active"
            :loading="irrigating"
            @click="doIrrigate"
          />
        </PageHeader>

        <q-banner v-if="pot.isDemo" rounded class="gda-demo-banner q-mb-md">
          <template #avatar><q-icon name="science" /></template>
          Zona de ejemplo: los datos son de demostración y no hay un nodo físico conectado.
          El riego manual se simula y no activa ninguna bomba.
        </q-banner>

        <!-- Cuadrícula de 12 columnas: cada fila alinea sus paneles a la misma altura -->
        <div class="gda-detail">
            <section class="gda-panel gda-col-8">
              <div class="gda-panel-head">
                <h2 class="gda-panel-title"><q-icon name="sensors" size="20px" /> Estado actual</h2>
                <span v-if="pot.lastReading?.measuredAt" class="gda-panel-meta">
                  Última lectura {{ fmtDate(pot.lastReading.measuredAt) }}
                  <StatusChip v-if="pot.lastReading.source === 'replay'" tone="warn" label="retransmitida" :dot="false" class="q-ml-xs" />
                </span>
              </div>
              <div class="gda-panel-body">
                <div v-if="pot.lastReading?.measuredAt" class="gda-kpis">
                  <div class="gda-kpi gda-kpi--main">
                    <span class="gda-label">Humedad del suelo</span>
                    <span class="gda-kpi-value" :class="`gda-kpi-value--${state.key}`">{{ round(pot.lastReading.soilMoisture) }}<small>%</small></span>
                    <span class="gda-kpi-note">Deseada {{ pot.minMoisture }}–{{ pot.maxMoisture }}%</span>
                  </div>
                  <div v-if="pot.lastReading.temperature != null" class="gda-kpi">
                    <span class="gda-label">Temperatura</span>
                    <span class="gda-kpi-value">{{ round(pot.lastReading.temperature) }}<small>°C</small></span>
                  </div>
                  <div v-if="pot.lastReading.airHumidity != null" class="gda-kpi">
                    <span class="gda-label">Humedad del aire</span>
                    <span class="gda-kpi-value">{{ round(pot.lastReading.airHumidity) }}<small>%</small></span>
                  </div>
                  <div class="gda-kpi">
                    <span class="gda-label">Bomba</span>
                    <span class="gda-kpi-value gda-kpi-value--text">
                      <q-spinner-rings v-if="pot.watering?.active" color="info" size="22px" />
                      {{ pot.watering?.active ? 'Regando' : 'Inactiva' }}
                    </span>
                    <span class="gda-kpi-note">
                      {{ pot.lastIrrigation?.at
                        ? `Último riego ${fmtDate(pot.lastIrrigation.at)} · ${pot.lastIrrigation.durationSec}s`
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
              </div>
            </section>

            <section class="gda-panel gda-col-4">
              <div class="gda-panel-head">
                <h2 class="gda-panel-title"><q-icon name="memory" size="20px" /> Nodo</h2>
                <span class="gda-chip" :class="pot.online ? 'gda-chip--ok' : 'gda-chip--neutral'">
                  <i /> {{ pot.online ? 'Conectado' : 'Sin conexión' }}
                </span>
              </div>
              <dl class="gda-dl">
                <div><dt>Node ID</dt><dd class="gda-mono">{{ pot.nodeId }}</dd></div>
                <template v-if="pot.diagnostics?.at">
                  <div><dt>Red</dt><dd class="gda-mono">{{ pot.diagnostics.ssid || '—' }}</dd></div>
                  <div><dt>IP (OTA/Telnet)</dt><dd class="gda-mono">{{ pot.diagnostics.ip || '—' }}</dd></div>
                  <div>
                    <dt>Señal</dt>
                    <dd>
                      <span class="gda-mono">{{ pot.diagnostics.rssi }} dBm</span>
                      <StatusChip :label="rssiQuality.label" :tone="rssiQuality.tone" class="q-ml-sm" />
                    </dd>
                  </div>
                  <div><dt>RAM libre</dt><dd class="gda-mono">{{ formatHeap(pot.diagnostics.heap) }}</dd></div>
                </template>
              </dl>
              <p class="gda-side-note gda-side-note--pad">
                {{ pot.isDemo ? 'Sin nodo físico: zona de demostración.' : 'La autenticación MQTT del nodo se gestiona en el broker (HiveMQ).' }}
              </p>
            </section>

            <section class="gda-panel gda-col-8">
              <div class="gda-panel-head">
                <h2 class="gda-panel-title"><q-icon name="show_chart" size="20px" /> Últimas 24 horas</h2>
              </div>
              <div class="gda-panel-body"><HistoryChart :readings="recent" /></div>
            </section>

            <section class="gda-panel gda-col-4">
              <div class="gda-panel-head">
                <h2 class="gda-panel-title"><q-icon name="rule" size="20px" /> Reglas de riego</h2>
              </div>
              <dl class="gda-dl">
                <div><dt>Humedad deseada</dt><dd class="gda-mono">{{ pot.minMoisture }}–{{ pot.maxMoisture }}%</dd></div>
                <div><dt>Duración del riego</dt><dd class="gda-mono">{{ pot.irrigationDurationSec }} s</dd></div>
                <div><dt>Exposición</dt><dd>{{ pot.exposure === 'interior' ? 'Interior' : 'Exterior' }}</dd></div>
                <template v-if="pot.exposure !== 'interior'">
                  <div><dt>Umbral de lluvia</dt><dd class="gda-mono">{{ pot.rainProbThreshold }}%</dd></div>
                  <div><dt>Emergencia</dt><dd class="gda-mono">{{ pot.emergencyMarginPts ?? 10 }} puntos</dd></div>
                  <div><dt>Espera máxima</dt><dd class="gda-mono">{{ pot.maxPostponeHours ?? 6 }} h</dd></div>
                </template>
                <div><dt>Calor extremo</dt><dd class="gda-mono">≥ {{ pot.heatTempThreshold }}°C · {{ pot.heatIrrigationDurationSec }} s</dd></div>
              </dl>
            </section>

            <section :class="['gda-panel', pot.plants?.length ? 'gda-col-8' : 'gda-col-12']">
              <div class="gda-panel-head">
                <h2 class="gda-panel-title"><q-icon name="cloud" size="20px" /> Pronóstico a 5 días</h2>
              </div>
              <div class="gda-panel-body">
                <ForecastStrip v-if="forecast?.daily?.length" :daily="forecast.daily" />
                <div v-else class="text-grey-6 text-caption">
                  {{ pot.location?.lat != null ? 'Pronóstico no disponible.' : 'Configurá la ubicación de la zona para ver el pronóstico.' }}
                </div>
              </div>
            </section>

            <section v-if="pot.plants?.length" class="gda-panel gda-col-4">
              <div class="gda-panel-head">
                <h2 class="gda-panel-title"><q-icon name="eco" size="20px" /> Macetas</h2>
                <span class="gda-panel-meta">{{ pot.plants.length }}</span>
              </div>
              <div class="gda-panel-body">
                <div class="gda-plants-list">
                  <span v-for="(pl, i) in pot.plants" :key="i" class="gda-plant">{{ pl.name }}</span>
                </div>
                <p class="gda-side-note">Comparten los límites de humedad de la zona.</p>
              </div>
            </section>
        </div>

        <!-- Historial -->
        <section class="gda-panel q-mt-lg">
          <div class="gda-panel-head">
            <h2 class="gda-panel-title"><q-icon name="history" size="20px" /> Historial</h2>
            <div class="gda-history-filters">
              <q-input v-model="fromDate" type="date" dense outlined label="Desde" />
              <q-input v-model="toDate" type="date" dense outlined label="Hasta" />
              <q-btn unelevated no-caps color="primary" icon="search" label="Buscar" @click="loadHistory" />
            </div>
          </div>
          <div class="gda-history-tabs">
            <SegmentedControl
              v-model="tab" label="Tipo de historial"
              :options="[
                { label: 'Riegos', value: 'events', icon: 'water_drop', count: events.length },
                { label: 'Lecturas', value: 'readings', icon: 'sensors', count: readings.length },
                { label: 'Alertas', value: 'alerts', icon: 'notifications', count: alerts.length }
              ]"
            />
          </div>

          <ResponsiveTable
            v-if="tab === 'events'"
            :rows="events" :columns="eventColumns" badge-column="result"
            :loading="loadingHistory" no-data-label="Sin riegos en el período." no-data-icon="water_drop"
          >
            <template #cell-result="{ value }">
              <StatusChip :tone="RESULT_TONE[value] || 'neutral'" :label="RESULT_LABEL[value] || value" />
            </template>
          </ResponsiveTable>

          <ResponsiveTable
            v-else-if="tab === 'readings'"
            :rows="readings" :columns="readingColumns" badge-column="status"
            :loading="loadingHistory" no-data-label="Sin lecturas en el período." no-data-icon="sensors"
          >
            <template #cell-soilMoisture="{ value }"><span class="gda-mono gda-cell-main">{{ value }}</span></template>
            <template #cell-temperature="{ value }"><span class="gda-mono">{{ value }}</span></template>
            <template #cell-airHumidity="{ value }"><span class="gda-mono">{{ value }}</span></template>
            <template #cell-status="{ value }">
              <StatusChip :tone="value === 'valida' ? 'ok' : 'crit'" :label="value === 'valida' ? 'Válida' : 'Inválida'" />
            </template>
          </ResponsiveTable>

          <ResponsiveTable
            v-else
            :rows="alerts" :columns="alertColumns" badge-column="status"
            :loading="loadingHistory" no-data-label="Sin alertas en el período." no-data-icon="notifications_off"
          >
            <template #cell-status="{ value }">
              <StatusChip :tone="value === 'activa' ? 'crit' : 'neutral'" :label="value === 'activa' ? 'Activa' : 'Resuelta'" />
            </template>
          </ResponsiveTable>
        </section>
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
import { potState } from '../../utils/potState.js';
import LoadingState from '../../components/LoadingState.vue';
import HistoryChart from '../../components/HistoryChart.vue';
import ForecastStrip from '../../components/ForecastStrip.vue';
import MoistureBand from '../../components/MoistureBand.vue';
import PageHeader from '../../components/PageHeader.vue';
import StatusChip from '../../components/StatusChip.vue';
import SegmentedControl from '../../components/SegmentedControl.vue';
import ResponsiveTable from '../../components/ResponsiveTable.vue';

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

const state = computed(() => (pot.value ? potState(pot.value) : { key: 'wait', label: '', tone: 'neutral' }));

const EVENT_LABELS = {
  riego_activado: 'Riego automático',
  riego_pospuesto: 'Riego pospuesto',
  riego_no_aplicado: 'No aplicado',
  riego_calor: 'Riego por calor',
  riego_manual: 'Riego manual'
};
const RESULT_LABEL = { confirmado: 'Confirmado', fallido: 'Fallido', pendiente: 'Pendiente', no_aplica: 'No aplica' };
const RESULT_TONE = { confirmado: 'ok', fallido: 'crit', pendiente: 'warn', no_aplica: 'neutral' };
const ALERT_LABELS = {
  critica: 'Crítica', preventiva: 'Preventiva', calor_extremo: 'Calor extremo',
  fallo_sensor: 'Fallo de sensor', exceso_humedad: 'Exceso de humedad'
};

const eventColumns = [
  { name: 'createdAt', label: 'Fecha', field: 'createdAt', align: 'left', format: fmtDate },
  { name: 'result', label: 'Resultado', field: 'result', align: 'left' },
  { name: 'type', label: 'Tipo', field: 'type', align: 'left', format: v => EVENT_LABELS[v] || v },
  { name: 'origin', label: 'Origen', field: 'origin', align: 'left', format: v => v === 'manual' ? 'Manual' : 'Automático' },
  { name: 'durationSec', label: 'Duración', field: 'durationSec', align: 'left', format: v => v ? `${v}s` : '—' },
  { name: 'message', label: 'Detalle', field: 'message', align: 'left', wide: true }
];

const readingColumns = [
  { name: 'measuredAt', label: 'Medición', field: 'measuredAt', align: 'left', format: fmtDate },
  { name: 'status', label: 'Estado', field: 'status', align: 'left' },
  { name: 'soilMoisture', label: 'Hum. suelo', field: 'soilMoisture', align: 'left', format: v => `${v}%` },
  { name: 'temperature', label: 'Temp.', field: 'temperature', align: 'left', format: v => (v == null ? '—' : `${v}°C`) },
  { name: 'airHumidity', label: 'Hum. aire', field: 'airHumidity', align: 'left', format: v => (v == null ? '—' : `${v}%`) },
  { name: 'source', label: 'Fuente', field: 'source', align: 'left', format: v => v === 'replay' ? 'Retransmitida' : 'En vivo' }
];

const alertColumns = [
  { name: 'createdAt', label: 'Fecha', field: 'createdAt', align: 'left', format: fmtDate },
  { name: 'status', label: 'Estado', field: 'status', align: 'left' },
  { name: 'type', label: 'Tipo', field: 'type', align: 'left', format: v => ALERT_LABELS[v] || v },
  { name: 'message', label: 'Mensaje', field: 'message', align: 'left', wide: true }
];

function round(v) { return v == null ? '–' : Math.round(v * 10) / 10; }

// Interpretación del RSSI según la tabla del equipo (GDA Guia Setup)
const rssiQuality = computed(() => {
  const rssi = pot.value?.diagnostics?.rssi;
  if (rssi == null) return { label: '—', tone: 'neutral' };
  if (rssi >= -60) return { label: 'Excelente', tone: 'ok' };
  if (rssi >= -70) return { label: 'Buena', tone: 'ok' };
  if (rssi >= -80) return { label: 'Justa', tone: 'warn' };
  return { label: 'Muy débil', tone: 'crit' };
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
    $q.notify({ type: 'negative', message: e.message || 'No se pudo cargar la zona' });
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
    // Un mismo riego se difunde varias veces (pendiente → confirmado/fallido): se actualiza su
    // fila en vez de agregar otra, que dejaría una fila "pendiente" huérfana al lado.
    const i = events.value.findIndex((e) => String(e._id) === String(data._id));
    if (i >= 0) events.value.splice(i, 1, { ...events.value[i], ...data });
    else events.value.unshift(data);
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
.gda-head-meta { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 6px 14px; }
.gda-demo-banner { background: #F7ECD9; color: var(--gda-ink); border: 1px solid var(--gda-hairline); }

.gda-detail { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 20px; align-items: stretch; }
.gda-detail > .gda-panel { display: flex; flex-direction: column; min-width: 0; }
.gda-detail > .gda-panel > .gda-panel-body,
.gda-detail > .gda-panel > .gda-dl { flex: 1; }
.gda-col-8 { grid-column: span 8; }
.gda-col-4 { grid-column: span 4; }
.gda-col-12 { grid-column: span 12; }

.gda-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; }
.gda-kpi { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.gda-kpi-value {
  font-family: var(--gda-font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 32px;
  font-weight: 600;
  line-height: 1.05;
  color: var(--gda-ink);
  display: flex;
  min-height: 34px;
  align-items: center;
  gap: 8px;
}
.gda-kpi-value small { font-size: 14px; font-weight: 500; color: var(--gda-ink-soft); margin-left: -4px; }
.gda-kpi--main .gda-kpi-value { color: var(--gda-leaf); }
.gda-kpi-value--dry { color: var(--gda-clay) !important; }
.gda-kpi-value--wet, .gda-kpi-value--watering { color: var(--gda-water) !important; }
.gda-kpi-value--offline, .gda-kpi-value--wait { color: var(--gda-ink-soft) !important; }
.gda-kpi-value--text { font-family: var(--gda-font-display); font-size: 20px; font-weight: 700; }
.gda-kpi-note { font-size: 12px; color: var(--gda-ink-soft); }

.gda-plants-list { display: flex; flex-wrap: wrap; gap: 6px; }
.gda-plant {
  font-size: 12.5px;
  padding: 4px 11px;
  border-radius: 999px;
  background: var(--gda-leaf-tint);
  color: var(--gda-ink);
}
.gda-side-note { margin: 12px 0 0; font-size: 12.5px; color: var(--gda-ink-soft); }
.gda-side-note--pad { margin: 0; padding: 12px 20px 16px; border-top: 1px solid var(--gda-hairline); }

.gda-dl { margin: 0; }
.gda-dl > div,
.gda-dl > template > div {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 11px 20px;
  border-top: 1px solid var(--gda-hairline);
  font-size: 13.5px;
}
.gda-dl > div:first-child { border-top: 0; }
.gda-dl dt { color: var(--gda-ink-soft); }
.gda-dl dd { margin: 0; color: var(--gda-ink); font-weight: 500; text-align: right; word-break: break-all; }

.gda-history-filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.gda-history-filters .q-field { width: 160px; }
.gda-history-tabs { padding: 14px 20px 6px; }

@media (max-width: 1180px) {
  .gda-detail { grid-template-columns: 1fr; }
  .gda-col-8, .gda-col-4, .gda-col-12 { grid-column: 1 / -1; }
  .gda-kpis { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 599px) {
  .gda-history-filters { width: 100%; }
  .gda-history-filters .q-field { flex: 1; width: auto; min-width: 130px; }
  .gda-history-tabs { padding: 12px 16px 6px; }
}
</style>
