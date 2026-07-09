<template>
  <div class="gda-forecast">
    <div v-for="day in daily" :key="day.date" class="gda-forecast-day">
      <div class="gda-forecast-date">{{ shortDate(day.date) }}</div>
      <q-icon :name="iconFor(day.condition)" size="26px" :class="`gda-cond--${day.condition}`" />
      <div class="gda-forecast-temps gda-mono">
        <span class="gda-tmax">{{ Math.round(day.tempMax) }}°</span>
        <span class="gda-tmin">{{ Math.round(day.tempMin) }}°</span>
      </div>
      <div class="gda-forecast-rain gda-mono">
        <q-icon name="water_drop" size="11px" /> {{ day.rainProbabilityMax }}%
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  daily: { type: Array, default: () => [] }
});

function shortDate(d) {
  return new Date(`${d}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' });
}
function iconFor(condition) {
  if (condition === 'despejado') return 'wb_sunny';
  if (condition === 'lluvioso') return 'umbrella';
  return 'cloud';
}
</script>

<style scoped>
.gda-forecast { display: flex; gap: 10px; flex-wrap: wrap; }
.gda-forecast-day {
  flex: 1;
  min-width: 86px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 13px 8px;
  background: var(--gda-mist);
  border: 1px solid var(--gda-hairline);
  border-radius: 11px;
}
.gda-forecast-date {
  font-family: var(--gda-font-mono);
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--gda-ink-soft);
}
.gda-cond--despejado { color: var(--gda-sun); }
.gda-cond--nublado { color: var(--gda-ink-soft); }
.gda-cond--lluvioso { color: var(--gda-water); }
.gda-forecast-temps { display: flex; gap: 7px; font-size: 13px; }
.gda-tmax { font-weight: 600; color: var(--gda-ink); }
.gda-tmin { color: var(--gda-ink-soft); }
.gda-forecast-rain {
  font-size: 11px;
  color: var(--gda-water);
  display: flex;
  align-items: center;
  gap: 3px;
}
</style>
