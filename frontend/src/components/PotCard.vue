<template>
  <article class="gda-zone" :class="[`gda-zone--${state.key}`, { 'gda-zone--real': !pot.isDemo }]">
    <header class="gda-zone-head">
      <div class="gda-zone-id">
        <h3 class="gda-zone-name">{{ pot.name }}</h3>
      </div>
      <div class="gda-zone-flags">
        <span v-if="pot.isDemo" class="gda-zone-demo">Ejemplo</span>
        <StatusChip :label="state.label" :tone="state.tone" />
      </div>
    </header>

    <div v-if="pot.lastReading?.measuredAt" class="gda-zone-readouts">
      <div class="gda-zone-main">
        <span class="gda-label">Humedad del suelo</span>
        <span class="gda-zone-value">{{ fmt(pot.lastReading.soilMoisture) }}<small>%</small></span>
      </div>
      <!-- Temperatura y aire solo si el nodo los reporta (el AM2302 puede no estar conectado) -->
      <div v-if="pot.lastReading.temperature != null" class="gda-zone-stat">
        <span class="gda-label">Temp.</span>
        <span class="gda-zone-stat-value">{{ fmt(pot.lastReading.temperature) }}<small>°C</small></span>
      </div>
      <div v-if="pot.lastReading.airHumidity != null" class="gda-zone-stat">
        <span class="gda-label">Aire</span>
        <span class="gda-zone-stat-value">{{ fmt(pot.lastReading.airHumidity) }}<small>%</small></span>
      </div>
    </div>
    <div v-else class="gda-zone-nodata">Esperando la primera lectura del nodo</div>

    <MoistureBand
      :value="pot.lastReading?.soilMoisture ?? null"
      :min="pot.minMoisture"
      :max="pot.maxMoisture"
    />

    <div class="gda-zone-meta">
      <span v-if="pot.watering?.active" class="gda-zone-watering">
        <span class="gda-ripple"><i /><i /><i /></span> Regando…
      </span>
      <span v-else-if="pot.lastIrrigation?.at">Último riego {{ formatDate(pot.lastIrrigation.at) }} · {{ pot.lastIrrigation.durationSec }} s</span>
      <span v-else>Sin riegos registrados</span>
      <span v-if="pot.activeAlerts" class="gda-zone-alert">
        <i aria-hidden="true" /> {{ pot.activeAlerts }} alerta{{ pot.activeAlerts > 1 ? 's' : '' }}
      </span>
    </div>

    <footer class="gda-zone-actions">
      <q-btn flat no-caps dense color="primary" label="Ver detalle" icon-right="arrow_forward" @click="$emit('open', pot)" />
      <q-btn
        v-if="canOperate"
        outline no-caps color="secondary" label="Regar ahora" icon="water_drop"
        :disable="!pot.online || pot.watering?.active"
        @click="$emit('irrigate', pot)"
      />
    </footer>
  </article>
</template>

<script setup>
import { computed } from 'vue';
import MoistureBand from './MoistureBand.vue';
import StatusChip from './StatusChip.vue';
import { potState } from '../utils/potState.js';

const props = defineProps({
  pot: { type: Object, required: true },
  canOperate: Boolean
});
defineEmits(['open', 'irrigate']);

const state = computed(() => potState(props.pot));

function fmt(v) {
  return v == null ? '–' : Math.round(v * 10) / 10;
}
function formatDate(d) {
  return new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}
</script>

<style scoped>
.gda-zone {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 22px 22px 16px;
  background: var(--gda-card);
  border: 1px solid var(--gda-hairline);
  border-radius: 14px;
  transition: box-shadow 0.25s ease, border-color 0.25s ease;
}
.gda-zone:hover { border-color: #C4D1C1; box-shadow: 0 6px 20px rgba(31, 42, 34, 0.06); }
.gda-zone--offline:not(.gda-zone--real) { background: #FAFBF9; }
.gda-zone--offline .gda-zone-readouts, .gda-zone--offline :deep(.gda-band) { opacity: 0.55; }

.gda-zone-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.gda-zone-id { min-width: 0; }
.gda-zone-name {
  font-family: var(--gda-font-display);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.25;
  margin: 0;
  color: var(--gda-ink);
}
.gda-zone-flags { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.gda-zone-demo { font-size: 12px; color: var(--gda-ink-soft); }

/* Nodo real: la única tarjeta destacada, en verde pino */
.gda-zone--real {
  background: var(--gda-pine-deep);
  border-color: var(--gda-pine-deep);
  color: #E9F1E7;
}
.gda-zone--real:hover { border-color: var(--gda-pine-deep); box-shadow: 0 10px 28px rgba(27, 43, 33, 0.28); }
.gda-zone--real .gda-zone-name,
.gda-zone--real .gda-zone-value,
.gda-zone--real .gda-zone-stat-value { color: #fff; }
.gda-zone--real .gda-zone-value small,
.gda-zone--real .gda-zone-stat-value small,
.gda-zone--real .gda-zone-meta,
.gda-zone--real .gda-zone-nodata { color: rgba(233, 241, 231, 0.65); }
.gda-zone--real .gda-label { color: rgba(233, 241, 231, 0.55); }
.gda-zone--real .gda-zone-actions { border-top-color: rgba(255, 255, 255, 0.12); }
.gda-zone--real .gda-zone-alert { color: #F0A98A; }
.gda-zone--real .gda-zone-alert i { background: #F0A98A; }
.gda-zone--real .gda-zone-watering { color: #8CC8E8; }
.gda-zone--real :deep(.gda-band-track) { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.14); }
.gda-zone--real :deep(.gda-band-safe) { background: rgba(127, 201, 143, 0.24); border-color: var(--gda-leaf-bright); }
.gda-zone--real :deep(.gda-band-marker) { border-color: var(--gda-pine-deep); }
.gda-zone--real :deep(.gda-band-tick) { color: rgba(233, 241, 231, 0.6); }
.gda-zone--real :deep(.q-btn.text-primary) { color: var(--gda-leaf-bright) !important; }
.gda-zone--real :deep(.q-btn.text-secondary) { color: #fff !important; }
.gda-zone--real :deep(.q-btn--outline:before) { border-color: rgba(255, 255, 255, 0.4); }
.gda-zone--real :deep(.q-btn.disabled) { opacity: 0.4 !important; }

/* Lectura principal en tinta neutra: el estado ya lo dice la etiqueta */
.gda-zone-readouts { display: flex; align-items: flex-end; gap: 28px; }
.gda-zone-main { display: flex; flex-direction: column; gap: 8px; flex: 1; }
.gda-zone-value {
  font-family: var(--gda-font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 40px;
  font-weight: 600;
  line-height: 1;
  color: var(--gda-ink);
}
.gda-zone-value small { font-size: 16px; font-weight: 500; margin-left: 2px; color: var(--gda-ink-soft); }
.gda-zone-stat { display: flex; flex-direction: column; gap: 8px; }
.gda-zone-stat-value {
  font-family: var(--gda-font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 18px;
  font-weight: 500;
  line-height: 1.15;
  color: var(--gda-ink);
}
.gda-zone-stat-value small { font-size: 12px; margin-left: 1px; color: var(--gda-ink-soft); }
.gda-zone-nodata { padding: 12px 0; font-size: 13px; color: var(--gda-ink-soft); }

.gda-zone-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12.5px;
  color: var(--gda-ink-soft);
}
.gda-zone-alert { display: inline-flex; align-items: center; gap: 6px; color: var(--gda-clay); font-weight: 600; }
.gda-zone-alert i { width: 7px; height: 7px; border-radius: 50%; background: var(--gda-clay); }
.gda-zone-watering { display: inline-flex; align-items: center; gap: 8px; color: var(--gda-water); font-weight: 600; }
.gda-ripple { display: inline-flex; gap: 3px; align-items: flex-end; height: 12px; }
.gda-ripple i {
  width: 4px;
  border-radius: 2px;
  background: var(--gda-water);
  animation: gda-drip 1s ease-in-out infinite;
}
.gda-ripple i:nth-child(1) { height: 6px; animation-delay: 0s; }
.gda-ripple i:nth-child(2) { height: 10px; animation-delay: 0.15s; }
.gda-ripple i:nth-child(3) { height: 7px; animation-delay: 0.3s; }
@keyframes gda-drip {
  0%, 100% { transform: scaleY(0.6); opacity: 0.6; }
  50% { transform: scaleY(1); opacity: 1; }
}

.gda-zone-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--gda-hairline);
}
</style>
