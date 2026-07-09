<template>
  <div class="gda-page-shell">
    <div class="gda-page-header">
      <div>
        <h1 class="gda-page-title">Ajustes</h1>
        <p class="gda-page-subtitle">Preferencias de notificación de alertas</p>
      </div>
    </div>

    <div class="gda-section-card" style="max-width: 560px">
      <LoadingState :loading="loading" :empty="false">
        <div class="q-mb-md">
          <div class="text-subtitle2 q-mb-xs">Canales</div>
          <q-toggle v-model="prefs.email" label="Recibir alertas por email" color="primary" />
        </div>

        <div class="text-subtitle2 q-mb-xs">Tipos de alerta a notificar</div>
        <q-list dense>
          <q-item v-for="t in types" :key="t.key" tag="label">
            <q-item-section>
              <q-item-label>{{ t.label }}</q-item-label>
              <q-item-label caption>{{ t.caption }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-toggle v-model="prefs.types[t.key]" color="primary" />
            </q-item-section>
          </q-item>
        </q-list>

        <q-btn color="primary" label="Guardar preferencias" class="q-mt-md" :loading="saving" @click="save" />
      </LoadingState>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { fetchMe, updateMyPreferences } from '../../services/api.js';
import LoadingState from '../../components/LoadingState.vue';

const $q = useQuasar();
const loading = ref(true);
const saving = ref(false);

const prefs = reactive({
  email: true,
  types: {
    critica: true,
    preventiva: true,
    calor_extremo: true,
    fallo_sensor: true,
    exceso_humedad: true
  }
});

const types = [
  { key: 'critica', label: 'Crítica', caption: 'Humedad bajo el mínimo sin lluvia prevista (se riega)' },
  { key: 'preventiva', label: 'Preventiva', caption: 'Humedad baja pero con lluvia prevista (riego pospuesto)' },
  { key: 'calor_extremo', label: 'Calor extremo', caption: 'Temperatura alta + humedad baja' },
  { key: 'fallo_sensor', label: 'Fallo de sensor', caption: 'Sin datos de una maceta por más de 15 minutos' },
  { key: 'exceso_humedad', label: 'Exceso de humedad', caption: 'Humedad por sobre el máximo configurado' }
];

onMounted(async () => {
  try {
    const me = await fetchMe();
    if (me.alertPrefs) {
      prefs.email = me.alertPrefs.email ?? true;
      Object.assign(prefs.types, me.alertPrefs.types || {});
    }
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudo cargar el perfil' });
  } finally {
    loading.value = false;
  }
});

async function save() {
  saving.value = true;
  try {
    await updateMyPreferences({ email: prefs.email, types: { ...prefs.types } });
    $q.notify({ type: 'positive', message: 'Preferencias guardadas' });
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudieron guardar las preferencias' });
  } finally {
    saving.value = false;
  }
}
</script>
