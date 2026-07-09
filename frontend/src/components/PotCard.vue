<template>
  <article class="gda-pot-card" :class="{ 'gda-pot-card--offline': !pot.online }">
    <header class="gda-pot-head">
      <div class="gda-pot-id">
        <h3 class="gda-pot-name">{{ pot.name }}</h3>
        <div class="gda-pot-node">
          <span class="gda-dot" :class="{ 'gda-dot--on': pot.online }" />
          <span class="gda-mono">{{ pot.nodeId }}</span>
          <span class="gda-pot-conn">{{ pot.online ? 'online' : 'offline' }}</span>
        </div>
      </div>
      <q-badge v-if="pot.activeAlerts" color="accent" :label="`${pot.activeAlerts} alerta${pot.activeAlerts > 1 ? 's' : ''}`" />
    </header>

    <div v-if="pot.lastReading?.measuredAt" class="gda-pot-readouts">
      <div class="gda-readout gda-readout--main">
        <span class="gda-readout-value" :class="`gda-zone--${zone}`">{{ fmt(pot.lastReading.soilMoisture) }}<small>%</small></span>
        <span class="gda-metric-label">Humedad suelo</span>
      </div>
      <div class="gda-readout">
        <span class="gda-readout-value">{{ fmt(pot.lastReading.temperature) }}<small>°C</small></span>
        <span class="gda-metric-label">Temp.</span>
      </div>
      <div class="gda-readout">
        <span class="gda-readout-value">{{ fmt(pot.lastReading.airHumidity) }}<small>%</small></span>
        <span class="gda-metric-label">Aire</span>
      </div>
    </div>
    <div v-else class="gda-pot-nodata">Esperando la primera lectura del nodo</div>

    <MoistureBand
      class="gda-pot-band"
      :value="pot.lastReading?.soilMoisture ?? null"
      :min="pot.minMoisture"
      :max="pot.maxMoisture"
    />

    <div class="gda-pot-status">
      <template v-if="pot.watering?.active">
        <span class="gda-watering">
          <span class="gda-ripple"><i /><i /><i /></span>
          Regando…
        </span>
      </template>
      <template v-else-if="pot.lastIrrigation?.at">
        <span>Último riego</span>
        <span class="gda-mono">{{ formatDate(pot.lastIrrigation.at) }} · {{ pot.lastIrrigation.durationSec }}s</span>
      </template>
      <template v-else>
        <span>Sin riegos registrados</span>
      </template>
    </div>

    <footer class="gda-pot-actions">
      <q-btn flat dense color="primary" label="Detalle" icon="visibility" @click="$emit('open', pot)" />
      <q-btn
        v-if="canOperate"
        unelevated dense color="secondary" label="Regar ahora" icon="water_drop"
        :disable="!pot.online || pot.watering?.active"
        @click="$emit('irrigate', pot)"
      />
    </footer>
  </article>
</template>

<script setup>
import { computed } from 'vue';
import MoistureBand from './MoistureBand.vue';

const props = defineProps({
  pot: { type: Object, required: true },
  canOperate: Boolean
});
defineEmits(['open', 'irrigate']);

const zone = computed(() => {
  const soil = props.pot.lastReading?.soilMoisture;
  if (soil == null) return 'ok';
  if (soil < props.pot.minMoisture) return 'dry';
  if (soil > props.pot.maxMoisture) return 'wet';
  return 'ok';
});

function fmt(v) {
  return v == null ? '–' : Math.round(v * 10) / 10;
}

function formatDate(d) {
  return new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
</script>

<style scoped>
.gda-pot-card {
  background: var(--gda-card);
  border: 1px solid var(--gda-hairline);
  border-radius: 14px;
  padding: 18px 18px 12px;
  display: flex;
  flex-direction: column;
  transition: box-shadow 0.25s ease, transform 0.25s ease;
}
.gda-pot-card:hover {
  box-shadow: 0 6px 20px rgba(31, 42, 34, 0.09);
  transform: translateY(-1px);
}
.gda-pot-card--offline { opacity: 0.72; }

.gda-pot-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}
.gda-pot-name {
  font-family: var(--gda-font-display);
  font-size: 17px;
  font-weight: 700;
  color: var(--gda-ink);
  margin: 0;
}
.gda-pot-node {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--gda-ink-soft);
}
.gda-pot-conn { text-transform: uppercase; letter-spacing: 0.06em; font-size: 10px; }

.gda-pot-readouts {
  display: flex;
  align-items: flex-end;
  gap: 26px;
  margin: 16px 0 14px;
}
.gda-readout { display: flex; flex-direction: column; gap: 3px; }
.gda-readout-value {
  font-family: var(--gda-font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 19px;
  font-weight: 600;
  color: var(--gda-ink);
  line-height: 1;
}
.gda-readout-value small { font-size: 12px; font-weight: 500; margin-left: 1px; color: var(--gda-ink-soft); }
.gda-readout--main .gda-readout-value { font-size: 30px; }
.gda-zone--dry { color: var(--gda-clay); }
.gda-zone--ok { color: var(--gda-leaf); }
.gda-zone--wet { color: var(--gda-water); }

.gda-pot-nodata {
  margin: 18px 0 14px;
  font-size: 13px;
  color: var(--gda-ink-soft);
}

.gda-pot-band { margin-bottom: 4px; }

.gda-pot-status {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--gda-ink-soft);
  padding: 10px 0;
  border-top: 1px solid var(--gda-hairline);
  margin-top: 10px;
}

.gda-watering {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--gda-water);
  font-weight: 600;
}
/* Tres gotitas que ondulan mientras el nodo riega */
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

.gda-pot-actions {
  display: flex;
  justify-content: space-between;
  padding-top: 8px;
}
</style>
