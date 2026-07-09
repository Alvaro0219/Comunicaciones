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
      borderColor: '#16a34a',
      backgroundColor: 'rgba(22, 163, 74, 0.08)',
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      yAxisID: 'humidity'
    },
    {
      label: 'Temperatura (°C)',
      data: props.readings.map(r => r.temperature),
      borderColor: '#f59e0b',
      tension: 0.3,
      pointRadius: 0,
      yAxisID: 'temp'
    },
    {
      label: 'Humedad aire (%)',
      data: props.readings.map(r => r.airHumidity),
      borderColor: '#0ea5e9',
      borderDash: [4, 4],
      tension: 0.3,
      pointRadius: 0,
      yAxisID: 'humidity'
    }
  ]
}));

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  scales: {
    humidity: { type: 'linear', position: 'left', min: 0, max: 100, title: { display: true, text: '%' } },
    temp: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: '°C' } }
  },
  plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } }
};
</script>

<style scoped>
.gda-chart-wrap { height: 320px; position: relative; }
</style>
