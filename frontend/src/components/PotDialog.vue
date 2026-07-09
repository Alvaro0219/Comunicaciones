<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card class="gda-pot-dialog">
      <q-card-section>
        <div class="text-h6">{{ isEdit ? 'Editar maceta' : 'Nueva maceta' }}</div>
      </q-card-section>

      <q-card-section class="q-gutter-y-sm">
        <q-input v-model="form.name" label="Nombre" dense outlined :rules="[v => !!v || 'Requerido']" />
        <q-input
          v-model="form.nodeId" label="ID del nodo (ESP32)" dense outlined
          :disable="isEdit"
          hint="3-64 caracteres: letras, números, - y _"
        />
        <div class="row q-col-gutter-sm">
          <div class="col-6">
            <q-input v-model.number="form.minMoisture" type="number" label="Humedad mínima (%)" dense outlined />
          </div>
          <div class="col-6">
            <q-input v-model.number="form.maxMoisture" type="number" label="Humedad máxima (%)" dense outlined />
          </div>
        </div>
        <div class="row q-col-gutter-sm">
          <div class="col-6">
            <q-input v-model.number="form.irrigationDurationSec" type="number" label="Duración riego (s)" dense outlined />
          </div>
          <div class="col-6">
            <q-input v-model.number="form.rainProbThreshold" type="number" label="Umbral prob. lluvia (%)" dense outlined />
          </div>
        </div>
        <div class="row q-col-gutter-sm">
          <div class="col-6">
            <q-input v-model.number="form.heatTempThreshold" type="number" label="Umbral calor (°C)" dense outlined />
          </div>
          <div class="col-6">
            <q-input v-model.number="form.heatIrrigationDurationSec" type="number" label="Riego breve calor (s)" dense outlined />
          </div>
        </div>

        <div class="text-caption text-grey-7 q-mt-sm">Ubicación (para el pronóstico meteorológico)</div>
        <div class="row q-col-gutter-sm">
          <div class="col-4">
            <q-input v-model.number="form.lat" type="number" label="Latitud" dense outlined />
          </div>
          <div class="col-4">
            <q-input v-model.number="form.lon" type="number" label="Longitud" dense outlined />
          </div>
          <div class="col-4">
            <q-input v-model="form.locationLabel" label="Etiqueta" dense outlined />
          </div>
        </div>

        <q-toggle v-if="isEdit" v-model="form.isActive" label="Maceta activa" />
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancelar" v-close-popup />
        <q-btn color="primary" :label="isEdit ? 'Guardar' : 'Crear'" :loading="saving" @click="submit" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { reactive, computed, watch } from 'vue';

const props = defineProps({
  modelValue: Boolean,
  pot: { type: Object, default: null },
  saving: Boolean
});
const emit = defineEmits(['update:modelValue', 'save']);

const isEdit = computed(() => !!props.pot);

const defaults = () => ({
  name: '',
  nodeId: '',
  minMoisture: 30,
  maxMoisture: 70,
  irrigationDurationSec: 5,
  rainProbThreshold: 50,
  heatTempThreshold: 35,
  heatIrrigationDurationSec: 3,
  lat: null,
  lon: null,
  locationLabel: '',
  isActive: true
});

const form = reactive(defaults());

watch(() => [props.modelValue, props.pot], () => {
  if (!props.modelValue) return;
  const base = defaults();
  if (props.pot) {
    Object.assign(base, {
      name: props.pot.name,
      nodeId: props.pot.nodeId,
      minMoisture: props.pot.minMoisture,
      maxMoisture: props.pot.maxMoisture,
      irrigationDurationSec: props.pot.irrigationDurationSec,
      rainProbThreshold: props.pot.rainProbThreshold,
      heatTempThreshold: props.pot.heatTempThreshold,
      heatIrrigationDurationSec: props.pot.heatIrrigationDurationSec,
      lat: props.pot.location?.lat ?? null,
      lon: props.pot.location?.lon ?? null,
      locationLabel: props.pot.location?.label ?? '',
      isActive: props.pot.isActive
    });
  }
  Object.assign(form, base);
}, { immediate: true });

function submit() {
  const payload = {
    name: form.name,
    minMoisture: form.minMoisture,
    maxMoisture: form.maxMoisture,
    irrigationDurationSec: form.irrigationDurationSec,
    rainProbThreshold: form.rainProbThreshold,
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
.gda-pot-dialog { width: 560px; max-width: 95vw; }
</style>
