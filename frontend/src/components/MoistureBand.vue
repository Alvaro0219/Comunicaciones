<template>
  <div
    class="gda-band"
    role="img"
    :aria-label="`Humedad de suelo ${value ?? 'sin dato'}%, rango configurado ${min} a ${max}%`"
  >
    <div class="gda-band-track">
      <div class="gda-band-safe" :style="{ left: `${min}%`, width: `${max - min}%` }" />
      <div
        v-if="value != null"
        class="gda-band-marker"
        :class="`gda-band-marker--${zone}`"
        :style="{ left: `${clamped}%` }"
      />
    </div>
    <div class="gda-band-ticks">
      <span class="gda-band-tick" :style="{ left: `${min}%` }">{{ min }}</span>
      <span class="gda-band-tick" :style="{ left: `${max}%` }">{{ max }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

// Banda de umbrales: la regla central del sistema hecha visible.
// Zona segura = franja min–max; el marcador toma el color del estado
// (seco -> arcilla, sano -> hoja, excedido -> agua).
const props = defineProps({
  value: { type: Number, default: null },
  min: { type: Number, required: true },
  max: { type: Number, required: true }
});

const clamped = computed(() => Math.min(100, Math.max(0, props.value ?? 0)));
const zone = computed(() => {
  if (props.value == null) return 'ok';
  if (props.value < props.min) return 'dry';
  if (props.value > props.max) return 'wet';
  return 'ok';
});
</script>

<style scoped>
.gda-band { width: 100%; }

.gda-band-track {
  position: relative;
  height: 10px;
  border-radius: 5px;
  background: var(--gda-mist);
  border: 1px solid var(--gda-hairline);
  overflow: visible;
}

.gda-band-safe {
  position: absolute;
  top: 0;
  bottom: 0;
  background: var(--gda-leaf-tint);
  border-left: 1px solid var(--gda-leaf);
  border-right: 1px solid var(--gda-leaf);
}

.gda-band-marker {
  position: absolute;
  top: 50%;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  border: 2.5px solid #fff;
  box-shadow: 0 1px 4px rgba(31, 42, 34, 0.35);
  transition: left 0.6s ease, background-color 0.4s ease;
}
.gda-band-marker--dry { background: var(--gda-clay); }
.gda-band-marker--ok { background: var(--gda-leaf); }
.gda-band-marker--wet { background: var(--gda-water); }

.gda-band-ticks {
  position: relative;
  height: 16px;
  margin-top: 3px;
}
.gda-band-tick {
  position: absolute;
  transform: translateX(-50%);
  font-family: var(--gda-font-mono);
  font-size: 10px;
  color: var(--gda-ink-soft);
}
</style>
