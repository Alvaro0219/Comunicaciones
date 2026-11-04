<template>
  <div class="gda-page-shell">
    <PageHeader title="Zonas" icon="grass" subtitle="Cada zona es un nodo con sus macetas, su especie y sus límites de humedad">
      <q-btn
        v-if="auth.canOperate"
        unelevated no-caps color="primary" icon="add" label="Nueva zona"
        @click="openCreate"
      />
    </PageHeader>

    <div class="gda-toolbar">
      <q-toggle v-model="showInactive" color="primary" label="Mostrar zonas desactivadas" />
      <q-input v-model="search" dense outlined clearable placeholder="Buscar zona o especie" class="gda-search">
        <template #prepend><q-icon name="search" /></template>
      </q-input>
    </div>

    <div class="gda-panel">
      <LoadingState :loading="loading" :empty="false">
        <ResponsiveTable
          :rows="visibleItems" :columns="columns" badge-column="state"
          no-data-label="No hay zonas para mostrar." no-data-icon="grass"
          :rows-per-page="12"
        >
          <template #cell-name="{ row }">
            <span class="gda-cell-main">{{ row.name }}</span>
            <span v-if="row.species || row.exposure === 'interior'" class="gda-cell-sub">
              {{ row.species }}<template v-if="row.species && row.exposure === 'interior'"> · </template><template v-if="row.exposure === 'interior'">interior</template>
            </span>
          </template>
          <template #cell-plants="{ row }"><span class="gda-mono">{{ row.plants?.length || 0 }}</span></template>
          <template #cell-limits="{ row }"><span class="gda-mono">{{ row.minMoisture }}–{{ row.maxMoisture }}%</span></template>
          <template #cell-nodeId="{ row }">
            <span class="gda-mono">{{ row.nodeId }}</span>
            <StatusChip v-if="row.isDemo" tone="warn" label="ejemplo" :dot="false" class="q-ml-xs" />
          </template>
          <template #cell-state="{ row }">
            <StatusChip :label="stateOf(row).label" :tone="stateOf(row).tone" />
          </template>
          <template #cell-isActive="{ row }">
            <StatusChip :tone="row.isActive ? 'dark' : 'neutral'" :label="row.isActive ? 'Activa' : 'Desactivada'" :dot="false" />
          </template>
          <template #cell-actions="{ row }">
            <q-btn flat dense round icon="visibility" color="primary" aria-label="Ver detalle" @click="$router.push(`/dashboard/pots/${row._id}`)">
              <q-tooltip>Ver detalle</q-tooltip>
            </q-btn>
            <template v-if="auth.canOperate">
              <q-btn flat dense round icon="edit" color="grey-8" aria-label="Editar" @click="openEdit(row)"><q-tooltip>Editar</q-tooltip></q-btn>
              <q-btn flat dense round icon="delete" color="negative" aria-label="Eliminar" @click="askDelete(row)">
                <q-tooltip>{{ row.isActive ? 'Desactivar' : 'Eliminar definitivamente' }}</q-tooltip>
              </q-btn>
            </template>
          </template>
        </ResponsiveTable>
      </LoadingState>
    </div>

    <PotDialog v-model="showDialog" :pot="editing" :saving="saving" @save="handleSave" />

    <!-- Identidad del nodo tras crear -->
    <AppDialog
      v-model="showCredentials" title="Zona registrada" icon="check_circle" width="520px"
      subtitle="El sistema va a procesar la telemetría que llegue con este Node ID" submit-label="Entendido"
      cancel-label="Cerrar" @submit="showCredentials = false"
    >
      <section class="gda-form-section">
        <q-input :model-value="createdPot?.nodeId" label="Node ID" outlined readonly>
          <template #prepend><q-icon name="memory" /></template>
        </q-input>
        <p class="gda-form-section-hint q-mt-md q-mb-none">
          Topic esperado: <code>{TOPIC_PREFIX}/{{ createdPot?.nodeId }}/telemetria</code>.
          El nodo real usa <code>gda/prod</code>; en desarrollo, tu prefijo propio.
          Las credenciales MQTT se gestionan en HiveMQ (documento interno del equipo).
        </p>
      </section>
    </AppDialog>

    <!-- Confirmación de borrado -->
    <AppDialog
      v-model="showDelete" :title="deleting?.isActive ? 'Desactivar zona' : 'Eliminar definitivamente'"
      icon="delete" tone="danger" width="440px" danger
      :submit-label="deleting?.isActive ? 'Desactivar' : 'Eliminar'" :loading="saving" @submit="handleDelete"
    >
      <section class="gda-form-section">
        <p v-if="deleting?.isActive" class="q-mb-none">
          Se desactivará <b>{{ deleting?.name }}</b> y dejará de procesar telemetría. Después podés eliminarla definitivamente.
        </p>
        <p v-else class="q-mb-none">
          Se eliminará <b>{{ deleting?.name }}</b> con sus lecturas, riegos y alertas. No se puede deshacer.
        </p>
      </section>
    </AppDialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../../stores/auth.js';
import { fetchAllPots, createPot, updatePot, deletePot } from '../../services/api.js';
import { useCrudResource } from '../../composables/useCrudResource.js';
import { potState } from '../../utils/potState.js';
import LoadingState from '../../components/LoadingState.vue';
import PotDialog from '../../components/PotDialog.vue';
import PageHeader from '../../components/PageHeader.vue';
import StatusChip from '../../components/StatusChip.vue';
import ResponsiveTable from '../../components/ResponsiveTable.vue';
import AppDialog from '../../components/AppDialog.vue';

const auth = useAuthStore();
const deleting = ref(null);
const showInactive = ref(false);
const search = ref('');

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

const visibleItems = computed(() => {
  const q = (search.value || '').trim().toLowerCase();
  return items.value.filter((p) => {
    if (!showInactive.value && !p.isActive) return false;
    return !q || `${p.name} ${p.species || ''} ${p.nodeId}`.toLowerCase().includes(q);
  });
});

const stateOf = (p) => (p.isActive ? potState(p) : { label: 'Inactiva', tone: 'neutral' });

const columns = [
  { name: 'name', label: 'Zona', field: 'name', align: 'left', sortable: true },
  { name: 'state', label: 'Estado', field: 'online', align: 'left' },
  { name: 'plants', label: 'Macetas', field: (r) => r.plants?.length || 0, align: 'center' },
  { name: 'limits', label: 'Humedad deseada', field: (r) => `${r.minMoisture}–${r.maxMoisture}%`, align: 'center' },
  { name: 'nodeId', label: 'Nodo', field: 'nodeId', align: 'left' },
  { name: 'isActive', label: 'Registro', field: 'isActive', align: 'center' },
  { name: 'actions', label: '', field: '_id', align: 'right' }
];

const showDialog = ref(false);
const editing = ref(null);
const showCredentials = ref(false);
const createdPot = ref(null);
const showDelete = ref(false);

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
