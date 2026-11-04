<template>
  <div class="gda-chart-wrap">
    <Line v-if="readings.length" :data="chartData" :options="chartOptions" />
    <div v-else class="app-empty-state">
      <q-icon name="show_chart" size="40px" color="grey-5" />
      <span>Sin lecturas en el período seleccionado.</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler
} from 'chart.js';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

const props = defineProps({
  readings: { type: Array, default: () => [] }
});

const chartData = computed(() => ({
  labels: props.readings.map(r =>
    new Date(r.measuredAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  ),
  datasets: [
    {
      label: 'Humedad suelo (%)',
      data: props.readings.map(r => r.soilMoisture),
      borderColor: '#3E7C4F', // --gda-leaf
      backgroundColor: 'rgba(62, 124, 79, 0.09)',
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      yAxisID: 'humidity'
    },
    {
      label: 'Temperatura (°C)',
      data: props.readings.map(r => r.temperature),
      borderColor: '#C9822B', // --gda-sun
      tension: 0.3,
      pointRadius: 0,
      yAxisID: 'temp'
    },
    {
      label: 'Humedad aire (%)',
      data: props.readings.map(r => r.airHumidity),
      borderColor: '#2E7DA6', // --gda-water
      borderDash: [4, 4],
      tension: 0.3,
      pointRadius: 0,
      yAxisID: 'humidity'
    }
    // Una serie sin ningún dato (sensor AM2302 todavía sin conectar) no se dibuja ni ensucia la leyenda
  ].filter(ds => ds.data.some(v => v != null))
}));

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  scales: {
    x: { ticks: { maxTicksLimit: 8, maxRotation: 0, color: '#5A6B5E', font: { family: 'IBM Plex Mono', size: 11 } }, grid: { display: false } },
    humidity: { type: 'linear', position: 'left', min: 0, max: 100, ticks: { color: '#5A6B5E', font: { family: 'IBM Plex Mono', size: 11 } }, grid: { color: '#E6ECE3' }, title: { display: true, text: '%', color: '#5A6B5E' } },
    // display:'auto' oculta el eje derecho cuando no hay serie de temperatura
    temp: { type: 'linear', position: 'right', display: 'auto', ticks: { color: '#5A6B5E', font: { family: 'IBM Plex Mono', size: 11 } }, grid: { drawOnChartArea: false }, title: { display: true, text: '°C', color: '#5A6B5E' } }
  },
  plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true, pointStyle: 'rectRounded', color: '#1F2A22', font: { family: 'Albert Sans', size: 12.5 } } } }
};
</script>

<style scoped>
.gda-chart-wrap { height: 320px; position: relative; }
</style>
