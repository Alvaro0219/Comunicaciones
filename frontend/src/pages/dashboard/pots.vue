<template>
  <div class="gda-page-shell">
    <div class="gda-page-header">
      <div>
        <h1 class="gda-page-title">Zonas</h1>
        <p class="gda-page-subtitle">Gestión de zonas: cada una con su nodo, su especie y sus macetas</p>
      </div>
      <q-btn
        v-if="auth.canOperate"
        color="primary" icon="add" label="Nueva zona"
        @click="openCreate"
      />
    </div>

    <div class="gda-section-card">
      <q-toggle v-model="showInactive" label="Mostrar zonas desactivadas" class="q-mb-sm" />
      <LoadingState :loading="loading" :empty="!loading && visibleItems.length === 0" empty-label="No hay zonas aún." empty-icon="grass">
        <q-table
          
          :rows="visibleItems" :columns="columns" row-key="_id" flat
          :pagination="{ rowsPerPage: 20 }"
        >
          <template #body-cell-online="props">
            <q-td :props="props">
              <q-badge :color="props.row.online ? 'positive' : 'grey-5'" :label="props.row.online ? 'online' : 'offline'" />
            </q-td>
          </template>
          <template #body-cell-isActive="props">
            <q-td :props="props">
              <q-badge :color="props.row.isActive ? 'primary' : 'grey-5'" :label="props.row.isActive ? 'activa' : 'inactiva'" />
              <q-badge v-if="props.row.isDemo" outline color="warning" label="ejemplo" class="q-ml-xs" />
            </q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props" class="q-gutter-x-xs">
              <q-btn flat dense round icon="visibility" color="primary" @click="$router.push(`/dashboard/pots/${props.row._id}`)" />
              <template v-if="auth.canOperate">
                <q-btn flat dense round icon="edit" color="grey-8" @click="openEdit(props.row)" />
                <q-btn flat dense round icon="delete" color="negative" @click="askDelete(props.row)" />
              </template>
            </q-td>
          </template>
        </q-table>
      </LoadingState>
    </div>

    <PotDialog v-model="showDialog" :pot="editing" :saving="saving" @save="handleSave" />

    <!-- Identidad del nodo tras crear -->
    <q-dialog v-model="showCredentials" persistent>
      <q-card style="width: 520px; max-width: 95vw">
        <q-card-section>
          <div class="text-h6">Zona registrada</div>
          <div class="text-caption text-grey-7">
            El sistema va a procesar la telemetría que llegue al broker con este Node ID.
          </div>
        </q-card-section>
        <q-card-section class="q-gutter-y-sm">
          <q-input :model-value="createdPot?.nodeId" label="Node ID" dense outlined readonly />
          <div class="text-caption text-grey-7">
            Topic esperado: <code>{TOPIC_PREFIX}/{{ createdPot?.nodeId }}/telemetria</code> —
            el nodo real usa <code>gda/prod</code>; en desarrollo, tu prefijo propio.
            Las credenciales MQTT se gestionan en HiveMQ (documento interno del equipo).
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn color="primary" label="Entendido" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Confirmación de borrado -->
    <q-dialog v-model="showDelete">
      <q-card style="width: 380px">
        <q-card-section class="text-h6">Eliminar zona</q-card-section>
        <q-card-section>
          <template v-if="deleting?.isActive">Se desactivará "{{ deleting?.name }}" y dejará de procesar telemetría. Después podés eliminarla definitivamente.</template>
          <template v-else>Se eliminará definitivamente "{{ deleting?.name }}" con sus lecturas, riegos y alertas. No se puede deshacer.</template>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn color="negative" label="Eliminar" :loading="saving" @click="handleDelete" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../../stores/auth.js';
import { fetchAllPots, createPot, updatePot, deletePot } from '../../services/api.js';
import { useCrudResource } from '../../composables/useCrudResource.js';
import LoadingState from '../../components/LoadingState.vue';
import PotDialog from '../../components/PotDialog.vue';

const auth = useAuthStore();
const showInactive = ref(false);

const {
  items, loading, saving, reload,
  create: doCreate, update: doUpdate, remove: doRemove
} = useCrudResource({
  fetchFn: fetchAllPots,
  createFn: createPot,
  updateFn: updatePot,
  deleteFn: (id) => deletePot(id, deleting.value?.isActive === false),
  label: 'la zona'
});

onMounted(reload);
const visibleItems = computed(() => (showInactive.value ? items.value : items.value.filter(p => p.isActive)));

const columns = [
  { name: 'name', label: 'Nombre', field: 'name', align: 'left', sortable: true },
  { name: 'species', label: 'Especie', field: 'species', align: 'left', format: v => v || '—' },
  { name: 'plants', label: 'Macetas', field: row => row.plants?.length || 0, align: 'center' },
  { name: 'nodeId', label: 'Nodo', field: 'nodeId', align: 'left' },
  { name: 'online', label: 'Conexión', field: 'online', align: 'center' },
  { name: 'minMoisture', label: 'Hum. mín', field: 'minMoisture', align: 'center', format: v => `${v}%` },
  { name: 'maxMoisture', label: 'Hum. máx', field: 'maxMoisture', align: 'center', format: v => `${v}%` },
  { name: 'isActive', label: 'Estado', field: 'isActive', align: 'center' },
  { name: 'actions', label: '', field: '_id', align: 'right' }
];

const showDialog = ref(false);
const editing = ref(null);
const showCredentials = ref(false);
const createdPot = ref(null);
const showDelete = ref(false);
const deleting = ref(null);

function openCreate() {
  editing.value = null;
  showDialog.value = true;
}

function openEdit(pot) {
  editing.value = pot;
  showDialog.value = true;
}

async function handleSave(payload) {
  if (editing.value) {
    const ok = await doUpdate(editing.value._id, payload);
    if (ok) showDialog.value = false;
  } else {
    const created = await doCreate(payload);
    if (created) {
      showDialog.value = false;
      createdPot.value = created;
      showCredentials.value = true;
    }
  }
}

function askDelete(pot) {
  deleting.value = pot;
  showDelete.value = true;
}

async function handleDelete() {
  const ok = await doRemove(deleting.value._id);
  if (ok) showDelete.value = false;
}
</script>
