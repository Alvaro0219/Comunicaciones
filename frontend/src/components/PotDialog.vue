<template>
  <AppDialog
    :model-value="modelValue"
    :title="isEdit ? 'Editar zona' : 'Nueva zona'"
    :subtitle="isEdit ? form.nodeId : 'Un nodo con sus macetas y sus límites de humedad'"
    icon="grass"
    width="680px"
    :submit-label="isEdit ? 'Guardar cambios' : 'Crear zona'"
    :loading="saving"
    @update:model-value="$emit('update:modelValue', $event)"
    @submit="submit"
  >
    <!-- Identificación -->
    <section class="gda-form-section">
      <div class="gda-form-section-head">
        <div class="gda-form-icon"><q-icon name="badge" size="20px" /></div>
        <div>
          <div class="gda-form-section-title">Identificación</div>
          <div class="gda-form-section-hint">Cómo se llama la zona y qué nodo la mide</div>
        </div>
      </div>
      <div class="gda-form-grid">
        <q-input v-model="form.name" label="Nombre de la zona" outlined :rules="[v => !!v || 'Requerido']" lazy-rules>
          <template #prepend><q-icon name="label" /></template>
        </q-input>
        <q-input v-model="form.species" label="Especie o cultivo" outlined hint="Ej.: Lavanda, helechos">
          <template #prepend><q-icon name="eco" /></template>
        </q-input>
        <q-input
          v-model="form.nodeId" label="ID del nodo (ESP32)" outlined :disable="isEdit"
          hint="3-64 caracteres: letras, números, - y _" class="is-wide"
        >
          <template #prepend><q-icon name="memory" /></template>
        </q-input>
        <div class="is-wide gda-plants">
          <div class="gda-plants-head">
            <span class="gda-plants-title">Macetas de la zona</span>
            <span class="gda-plants-count gda-mono">{{ form.plants.length }}</span>
          </div>
          <div class="gda-plants-add">
            <q-input
              v-model="newPlant" label="Nombre de la maceta" outlined class="gda-plants-name"
              hint="Enter para agregar. Podés escribir varias separadas por coma"
              @keydown.enter.prevent="addPlant"
            >
              <template #prepend><q-icon name="local_florist" /></template>
            </q-input>
            <q-input v-model.number="newQty" type="number" min="1" max="50" label="Cant." outlined class="gda-plants-qty" @keydown.enter.prevent="addPlant" />
            <q-btn unelevated no-caps color="primary" icon="add" label="Agregar" class="gda-plants-btn" :disable="!newPlant.trim()" @click="addPlant" />
          </div>
          <transition-group name="gda-plant-pop" tag="div" class="gda-plants-chips">
            <span v-for="g in plantGroups" :key="g.name" class="gda-plant-chip">
              <q-icon name="local_florist" size="16px" />
              <span>{{ g.name }}</span>
              <b v-if="g.count > 1" class="gda-mono">×{{ g.count }}</b>
              <button type="button" :aria-label="`Quitar ${g.name}`" @click="removePlant(g.name)"><q-icon name="close" size="14px" /></button>
            </span>
          </transition-group>
          <p v-if="!form.plants.length" class="gda-plants-empty">Todavía no agregaste macetas. Son descriptivas: el nodo mide la zona completa.</p>
        </div>
      </div>
    </section>

    <!-- Humedad deseada -->
    <section class="gda-form-section">
      <div class="gda-form-section-head">
        <div class="gda-form-icon gda-form-icon--water"><q-icon name="water_drop" size="20px" /></div>
        <div>
          <div class="gda-form-section-title">Humedad deseada del suelo</div>
          <div class="gda-form-section-hint">Por debajo del mínimo se riega; por encima del máximo se avisa</div>
        </div>
      </div>
      <div class="gda-range-readout">
        <span class="gda-mono">mín <b>{{ form.minMoisture }}%</b></span>
        <span class="gda-mono">máx <b>{{ form.maxMoisture }}%</b></span>
      </div>
      <q-range
        v-model="moistureRange" :min="0" :max="100" :step="1" :min-range="5"
        color="primary" track-color="grey-4" thumb-size="20px" label
        :left-label-value="`${moistureRange.min}%`" :right-label-value="`${moistureRange.max}%`"
        class="q-mx-sm"
      />
      <div class="gda-form-grid q-mt-md">
        <q-input v-model.number="form.irrigationDurationSec" type="number" label="Duración del riego" suffix="seg" outlined>
          <template #prepend><q-icon name="timer" /></template>
        </q-input>
      </div>
    </section>

    <!-- Lluvia -->
    <section class="gda-form-section">
      <div class="gda-form-section-head">
        <div class="gda-form-icon gda-form-icon--water"><q-icon name="cloud" size="20px" /></div>
        <div>
          <div class="gda-form-section-title">Lluvia</div>
          <div class="gda-form-section-hint">Cuándo el pronóstico puede posponer un riego</div>
        </div>
      </div>
      <SegmentedControl
        v-model="form.exposure" label="Exposición de la zona"
        :options="[
          { label: 'Exterior', value: 'exterior', icon: 'park' },
          { label: 'Interior o bajo techo', value: 'interior', icon: 'home' }
        ]"
      />
      <div v-if="form.exposure === 'exterior'" class="gda-form-grid q-mt-md">
        <q-input v-model.number="form.rainProbThreshold" type="number" label="Umbral de lluvia" suffix="%" outlined>
          <template #prepend><q-icon name="umbrella" /></template>
        </q-input>
        <q-input
          v-model.number="form.emergencyMarginPts" type="number" label="Emergencia" suffix="puntos" outlined
          hint="Si cae tanto bajo el mínimo, riega aunque llueva"
        >
          <template #prepend><q-icon name="emergency" /></template>
        </q-input>
        <q-input
          v-model.number="form.maxPostponeHours" type="number" label="Espera máxima por lluvia" suffix="h" outlined
          hint="Pasado ese tiempo, riega igual"
        >
          <template #prepend><q-icon name="hourglass_bottom" /></template>
        </q-input>
      </div>
      <p v-else class="gda-form-section-hint q-mt-md q-mb-none">Esta zona ignora el pronóstico: nunca se pospone el riego por lluvia.</p>
    </section>

    <!-- Calor -->
    <section class="gda-form-section">
      <div class="gda-form-section-head">
        <div class="gda-form-icon gda-form-icon--sun"><q-icon name="device_thermostat" size="20px" /></div>
        <div>
          <div class="gda-form-section-title">Calor extremo</div>
          <div class="gda-form-section-hint">Riego breve preventivo cuando hace mucho calor y el suelo está algo seco</div>
        </div>
      </div>
      <div class="gda-form-grid">
        <q-input v-model.number="form.heatTempThreshold" type="number" label="Umbral de calor" suffix="°C" outlined>
          <template #prepend><q-icon name="local_fire_department" /></template>
        </q-input>
        <q-input v-model.number="form.heatIrrigationDurationSec" type="number" label="Riego breve" suffix="seg" outlined>
          <template #prepend><q-icon name="timer" /></template>
        </q-input>
      </div>
    </section>

    <!-- Ubicación -->
    <section class="gda-form-section">
      <div class="gda-form-section-head">
        <div class="gda-form-icon"><q-icon name="location_on" size="20px" /></div>
        <div>
          <div class="gda-form-section-title">Ubicación</div>
          <div class="gda-form-section-hint">Para consultar el pronóstico del clima (con signo, ej.: -31.42)</div>
        </div>
      </div>
      <div class="gda-form-grid">
        <q-input v-model.number="form.lat" type="number" label="Latitud" outlined step="any" />
        <q-input v-model.number="form.lon" type="number" label="Longitud" outlined step="any" />
        <q-input v-model="form.locationLabel" label="Etiqueta del lugar" outlined class="is-wide" />
      </div>
    </section>

    <section v-if="isEdit" class="gda-form-section">
      <q-toggle v-model="form.isActive" label="Zona activa" color="primary" />
    </section>
  </AppDialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue';
import AppDialog from './AppDialog.vue';
import SegmentedControl from './SegmentedControl.vue';

const props = defineProps({
  modelValue: Boolean,
  pot: { type: Object, default: null },
  saving: Boolean
});
const emit = defineEmits(['update:modelValue', 'save']);

const isEdit = computed(() => !!props.pot);

const defaults = () => ({
  name: '',
  species: '',
  plants: [],
  nodeId: '',
  minMoisture: 30,
  maxMoisture: 70,
  irrigationDurationSec: 5,
  rainProbThreshold: 50,
  exposure: 'exterior',
  emergencyMarginPts: 10,
  maxPostponeHours: 6,
  heatTempThreshold: 35,
  heatIrrigationDurationSec: 3,
  lat: null,
  lon: null,
  locationLabel: '',
  isActive: true
});

const form = reactive(defaults());

// Macetas: se agregan de a una (o varias con coma y cantidad) y se muestran agrupadas
const MAX_PLANTS = 60;
const newPlant = ref('');
const newQty = ref(1);
const plantGroups = computed(() => {
  const map = new Map();
  for (const name of form.plants) map.set(name, (map.get(name) || 0) + 1);
  return [...map].map(([name, count]) => ({ name, count }));
});
function addPlant() {
  const names = newPlant.value.split(/[,\n]/).map(n => n.trim()).filter(Boolean);
  const qty = Math.max(1, Math.min(50, Number(newQty.value) || 1));
  for (const name of names) {
    for (let i = 0; i < qty && form.plants.length < MAX_PLANTS; i++) form.plants.push(name);
  }
  newPlant.value = '';
  newQty.value = 1;
}
function removePlant(name) {
  form.plants = form.plants.filter(n => n !== name);
}

// El control de rango edita mínimo y máximo a la vez
const moistureRange = computed({
  get: () => ({ min: form.minMoisture, max: form.maxMoisture }),
  set: (v) => { form.minMoisture = v.min; form.maxMoisture = v.max; }
});

watch(() => [props.modelValue, props.pot], () => {
  if (!props.modelValue) return;
  const base = defaults();
  if (props.pot) {
    Object.assign(base, {
      name: props.pot.name,
      species: props.pot.species || '',
      plants: (props.pot.plants || []).map(p => p.name),
      nodeId: props.pot.nodeId,
      minMoisture: props.pot.minMoisture,
      maxMoisture: props.pot.maxMoisture,
      irrigationDurationSec: props.pot.irrigationDurationSec,
      rainProbThreshold: props.pot.rainProbThreshold,
      exposure: props.pot.exposure || 'exterior',
      emergencyMarginPts: props.pot.emergencyMarginPts ?? 10,
      maxPostponeHours: props.pot.maxPostponeHours ?? 6,
      heatTempThreshold: props.pot.heatTempThreshold,
      heatIrrigationDurationSec: props.pot.heatIrrigationDurationSec,
      lat: props.pot.location?.lat ?? null,
      lon: props.pot.location?.lon ?? null,
      locationLabel: props.pot.location?.label ?? '',
      isActive: props.pot.isActive
    });
  }
  Object.assign(form, base);
  newPlant.value = '';
  newQty.value = 1;
}, { immediate: true });

function submit() {
  const payload = {
    name: form.name,
    species: form.species.trim(),
    plants: form.plants.map(name => ({ name })),
    minMoisture: form.minMoisture,
    maxMoisture: form.maxMoisture,
    irrigationDurationSec: form.irrigationDurationSec,
    rainProbThreshold: form.rainProbThreshold,
    exposure: form.exposure,
    emergencyMarginPts: form.emergencyMarginPts,
    maxPostponeHours: form.maxPostponeHours,
    heatTempThreshold: form.heatTempThreshold,
    heatIrrigationDurationSec: form.heatIrrigationDurationSec
  };
  if (!isEdit.value) payload.nodeId = form.nodeId;
  else payload.isActive = form.isActive;
  if (form.lat != null && form.lon != null && form.lat !== '' && form.lon !== '') {
    payload.location = { lat: form.lat, lon: form.lon, label: form.locationLabel || '' };
  }
  emit('save', payload);
}
</script>

<style scoped>
.gda-range-readout {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--gda-ink-soft);
  margin-bottom: 18px;
}
.gda-range-readout b { color: var(--gda-ink); font-size: 15px; }

.gda-plants { border: 1px solid var(--gda-hairline); border-radius: 12px; padding: 16px; background: #FAFCF9; }
.gda-plants-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.gda-plants-title { font-family: var(--gda-font-display); font-weight: 700; font-size: 14.5px; color: var(--gda-ink); }
.gda-plants-count {
  min-width: 28px; text-align: center; padding: 2px 10px; border-radius: 999px;
  background: var(--gda-pine); color: #fff; font-size: 12.5px; font-weight: 600;
}
.gda-plants-add { display: grid; grid-template-columns: minmax(0, 1fr) 84px auto; gap: 10px; align-items: start; }
.gda-plants-btn { height: 56px; }
.gda-plants-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.gda-plant-chip {
  display: inline-flex; align-items: center; gap: 7px; padding: 5px 6px 5px 10px; border-radius: 999px;
  background: var(--gda-leaf-tint); color: #24402B; font-size: 13.5px; font-weight: 500;
}
.gda-plant-chip .q-icon { color: var(--gda-leaf); }
.gda-plant-chip b { font-size: 12px; padding: 0 6px; border-radius: 999px; background: rgba(62, 124, 79, 0.18); }
.gda-plant-chip button {
  display: grid; place-items: center; width: 22px; height: 22px; border: 0; border-radius: 50%;
  background: transparent; color: #24402B; cursor: pointer;
}
.gda-plant-chip button:hover { background: rgba(31, 42, 34, 0.12); }
.gda-plants-empty { margin: 14px 0 0; font-size: 13px; color: var(--gda-ink-soft); }
.gda-plant-pop-enter-active { transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease; }
.gda-plant-pop-leave-active { transition: transform 0.15s ease, opacity 0.15s ease; position: absolute; }
.gda-plant-pop-enter-from, .gda-plant-pop-leave-to { opacity: 0; transform: scale(0.85); }
.gda-plant-pop-move { transition: transform 0.2s ease; }
@media (max-width: 599px) {
  .gda-plants-add { grid-template-columns: minmax(0, 1fr) 76px; }
  .gda-plants-btn { grid-column: 1 / -1; height: 44px; }
}
</style>
