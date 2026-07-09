<template>
  <div class="gda-forecast">
    <div v-for="day in daily" :key="day.date" class="gda-forecast-day">
      <div class="gda-forecast-date">{{ shortDate(day.date) }}</div>
      <q-icon :name="iconFor(day.condition)" size="28px" :color="colorFor(day.condition)" />
      <div class="gda-forecast-temps">
        <span class="gda-tmax">{{ Math.round(day.tempMax) }}°</span>
        <span class="gda-tmin">{{ Math.round(day.tempMin) }}°</span>
      </div>
      <div class="gda-forecast-rain">
        <q-icon name="water_drop" size="12px" /> {{ day.rainProbabilityMax }}%
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
function colorFor(condition) {
  if (condition === 'despejado') return 'amber-7';
  if (condition === 'lluvioso') return 'blue-7';
  return 'blue-grey-5';
}
</script>

<style scoped>
.gda-forecast { display: flex; gap: 10px; flex-wrap: wrap; }
.gda-forecast-day {
  flex: 1;
  min-width: 84px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}
.gda-forecast-date { font-size: 12px; font-weight: 600; color: #475569; text-transform: capitalize; }
.gda-forecast-temps { display: flex; gap: 6px; font-size: 13px; }
.gda-tmax { font-weight: 700; color: #0f172a; }
.gda-tmin { color: #94a3b8; }
.gda-forecast-rain { font-size: 11.5px; color: #0284c7; display: flex; align-items: center; gap: 2px; }
</style>
