<template>
  <div class="gda-page-shell">
    <PageHeader title="Ajustes" icon="tune" subtitle="Elegí cómo y de qué querés que te avise el sistema" />

    <LoadingState :loading="loading" :empty="false">
      <div class="gda-settings">
        <section class="gda-panel">
          <div class="gda-panel-head">
            <h2 class="gda-panel-title"><q-icon name="mail" size="20px" /> Canales</h2>
          </div>
          <label class="gda-pref">
            <div class="gda-pref-icon"><q-icon name="alternate_email" size="20px" /></div>
            <div class="gda-pref-text">
              <span class="gda-pref-title">Recibir alertas por email</span>
              <span class="gda-pref-caption">Si lo desactivás, las alertas siguen apareciendo en el dashboard.</span>
            </div>
            <q-toggle v-model="prefs.email" color="primary" />
          </label>
        </section>

        <section class="gda-panel">
          <div class="gda-panel-head">
            <h2 class="gda-panel-title"><q-icon name="notifications_active" size="20px" /> Tipos de alerta a notificar</h2>
            <span class="gda-panel-meta">{{ enabledCount }} de {{ types.length }} activos</span>
          </div>
          <label v-for="t in types" :key="t.key" class="gda-pref">
            <div class="gda-pref-icon" :class="`gda-pref-icon--${t.tone}`"><q-icon :name="t.icon" size="20px" /></div>
            <div class="gda-pref-text">
              <span class="gda-pref-title">{{ t.label }}</span>
              <span class="gda-pref-caption">{{ t.caption }}</span>
            </div>
            <q-toggle v-model="prefs.types[t.key]" color="primary" :disable="!prefs.email" />
          </label>
          <div class="gda-pref-foot">
            <span v-if="!prefs.email" class="gda-pref-hint">Activá el email para elegir los tipos.</span>
            <q-btn unelevated no-caps color="primary" icon="save" label="Guardar preferencias" :loading="saving" @click="save" />
          </div>
        </section>
      </div>
    </LoadingState>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { fetchMe, updateMyPreferences } from '../../services/api.js';
import LoadingState from '../../components/LoadingState.vue';
import PageHeader from '../../components/PageHeader.vue';

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
  { key: 'critica', label: 'Crítica', icon: 'error', tone: 'crit', caption: 'Humedad bajo el mínimo sin lluvia prevista (se riega)' },
  { key: 'preventiva', label: 'Preventiva', icon: 'cloud', tone: 'water', caption: 'Humedad baja pero con lluvia prevista (riego pospuesto)' },
  { key: 'calor_extremo', label: 'Calor extremo', icon: 'local_fire_department', tone: 'warn', caption: 'Temperatura alta con humedad baja' },
  { key: 'fallo_sensor', label: 'Fallo de sensor', icon: 'sensors_off', tone: 'neutral', caption: 'Sin datos de una zona por más de 15 minutos' },
  { key: 'exceso_humedad', label: 'Exceso de humedad', icon: 'water', tone: 'water', caption: 'Humedad por sobre el máximo configurado' }
];

const enabledCount = computed(() => types.filter((t) => prefs.types[t.key]).length);

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

<style scoped>
.gda-settings { display: grid; gap: 20px; max-width: 760px; }
.gda-pref {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-top: 1px solid var(--gda-hairline);
  cursor: pointer;
}
.gda-panel-head + .gda-pref { border-top: 0; }
.gda-pref:hover { background: #F9FBF8; }
.gda-pref-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: var(--gda-leaf-tint);
  color: var(--gda-leaf);
}
.gda-pref-icon--crit { background: var(--gda-clay-tint); color: var(--gda-clay); }
.gda-pref-icon--water { background: var(--gda-water-tint); color: var(--gda-water); }
.gda-pref-icon--warn { background: #F7ECD9; color: var(--gda-sun); }
.gda-pref-icon--neutral { background: var(--gda-mist); color: var(--gda-ink-soft); }
.gda-pref-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.gda-pref-title { font-weight: 600; font-size: 14.5px; color: var(--gda-ink); }
.gda-pref-caption { font-size: 13px; color: var(--gda-ink-soft); }
.gda-pref-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  flex-wrap: wrap;
  padding: 14px 20px;
  border-top: 1px solid var(--gda-hairline);
  background: #F6F9F4;
  border-radius: 0 0 14px 14px;
}
.gda-pref-hint { font-size: 12.5px; color: var(--gda-ink-soft); }
</style>
