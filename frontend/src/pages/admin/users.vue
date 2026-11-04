<template>
  <div class="gda-page-shell">
    <PageHeader title="Usuarios" icon="group" subtitle="Gestión de usuarios y roles (solo administrador)">
      <q-btn unelevated no-caps color="primary" icon="person_add" label="Nuevo usuario" @click="openCreate" />
    </PageHeader>

    <div class="gda-panel">
      <LoadingState :loading="loading" :empty="false">
        <ResponsiveTable
          :rows="items" :columns="columns" badge-column="role"
          no-data-label="No hay usuarios." no-data-icon="group" :rows-per-page="12"
        >
          <template #cell-fullName="{ row }">
            <span class="gda-user-cell">
              <span class="gda-user-avatar">{{ initials(row.fullName) }}</span>
              <span class="gda-cell-main">{{ row.fullName }}</span>
            </span>
          </template>
          <template #cell-role="{ row }">
            <StatusChip :tone="roleTone(row.role)" :label="roleLabel(row.role)" :dot="false" />
          </template>
          <template #cell-isActive="{ row }">
            <StatusChip :tone="row.isActive ? 'ok' : 'neutral'" :label="row.isActive ? 'Activo' : 'Inactivo'" />
          </template>
          <template #cell-actions="{ row }">
            <q-btn flat dense round icon="edit" color="grey-8" aria-label="Editar usuario" @click="openEdit(row)">
              <q-tooltip>Editar</q-tooltip>
            </q-btn>
          </template>
        </ResponsiveTable>
      </LoadingState>
    </div>

    <AppDialog
      v-model="showDialog" :title="editing ? 'Editar usuario' : 'Nuevo usuario'"
      :subtitle="editing ? editing.email : 'Elegí el rol según lo que necesita poder hacer'"
      icon="person" width="520px"
      :submit-label="editing ? 'Guardar cambios' : 'Crear usuario'" :loading="saving" @submit="submit"
    >
      <section class="gda-form-section">
        <div class="gda-form-grid">
          <q-input v-model="form.fullName" label="Nombre completo" outlined class="is-wide">
            <template #prepend><q-icon name="badge" /></template>
          </q-input>
          <q-input v-if="!editing" v-model="form.email" label="Email" type="email" outlined class="is-wide">
            <template #prepend><q-icon name="alternate_email" /></template>
          </q-input>
          <q-input
            v-model="form.password" outlined :type="showPass ? 'text' : 'password'" class="is-wide"
            :label="editing ? 'Nueva contraseña (opcional)' : 'Contraseña'"
            :hint="editing ? 'Dejala vacía para no cambiarla' : 'Mínimo 8 caracteres'"
          >
            <template #prepend><q-icon name="lock" /></template>
            <template #append>
              <q-icon :name="showPass ? 'visibility_off' : 'visibility'" class="cursor-pointer" @click="showPass = !showPass" />
            </template>
          </q-input>
        </div>
      </section>

      <section class="gda-form-section">
        <div class="gda-form-section-head">
          <div class="gda-form-icon"><q-icon name="admin_panel_settings" size="20px" /></div>
          <div>
            <div class="gda-form-section-title">Rol</div>
            <div class="gda-form-section-hint">{{ roleHint }}</div>
          </div>
        </div>
        <SegmentedControl v-model="form.role" label="Rol del usuario" :options="roleOptions" />
        <q-toggle v-if="editing" v-model="form.isActive" label="Usuario activo" color="primary" class="q-mt-md" />
      </section>
    </AppDialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { fetchUsers, createUser, updateUser } from '../../services/api.js';
import LoadingState from '../../components/LoadingState.vue';
import PageHeader from '../../components/PageHeader.vue';
import StatusChip from '../../components/StatusChip.vue';
import ResponsiveTable from '../../components/ResponsiveTable.vue';
import SegmentedControl from '../../components/SegmentedControl.vue';
import AppDialog from '../../components/AppDialog.vue';

const $q = useQuasar();

const items = ref([]);
const loading = ref(false);
const saving = ref(false);
const showDialog = ref(false);
const showPass = ref(false);
const editing = ref(null);

const roleOptions = [
  { label: 'Administrador', value: 'admin' },
  { label: 'Técnico', value: 'tecnico' },
  { label: 'Visualizador', value: 'visualizador' }
];
const ROLE_HINTS = {
  admin: 'Todo: ve todas las zonas, las configura, riega y gestiona usuarios.',
  tecnico: 'Crea y configura sus zonas y puede regar a mano.',
  visualizador: 'Solo mira el dashboard y el historial.'
};

const columns = [
  { name: 'fullName', label: 'Nombre', field: 'fullName', align: 'left', sortable: true },
  { name: 'email', label: 'Email', field: 'email', align: 'left' },
  { name: 'role', label: 'Rol', field: 'role', align: 'left', format: (v) => roleLabel(v) },
  { name: 'isActive', label: 'Estado', field: 'isActive', align: 'left' },
  { name: 'actions', label: '', field: '_id', align: 'right' }
];

const form = reactive({ fullName: '', email: '', password: '', role: 'visualizador', isActive: true });
const roleHint = computed(() => ROLE_HINTS[form.role] || '');

function roleLabel(r) {
  return roleOptions.find(o => o.value === r)?.label || r;
}
function roleTone(r) {
  return { admin: 'dark', tecnico: 'ok', visualizador: 'neutral' }[r] || 'neutral';
}
function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

async function reload() {
  loading.value = true;
  try {
    const res = await fetchUsers({ limit: 100 });
    items.value = res.items || [];
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudieron cargar los usuarios' });
  } finally {
    loading.value = false;
  }
}

onMounted(reload);

function openCreate() {
  editing.value = null;
  showPass.value = false;
  Object.assign(form, { fullName: '', email: '', password: '', role: 'visualizador', isActive: true });
  showDialog.value = true;
}

function openEdit(user) {
  editing.value = user;
  showPass.value = false;
  Object.assign(form, {
    fullName: user.fullName,
    email: user.email,
    password: '',
    role: user.role,
    isActive: user.isActive
  });
  showDialog.value = true;
}

async function submit() {
  saving.value = true;
  try {
    if (editing.value) {
      const payload = { fullName: form.fullName, role: form.role, isActive: form.isActive };
      if (form.password) payload.password = form.password;
      await updateUser(editing.value._id, payload);
    } else {
      await createUser({
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        role: form.role
      });
    }
    $q.notify({ type: 'positive', message: 'Usuario guardado' });
    showDialog.value = false;
    reload();
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudo guardar el usuario' });
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.gda-user-cell { display: inline-flex; align-items: center; gap: 10px; }
.gda-user-avatar {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--gda-leaf-tint);
  color: var(--gda-leaf);
  display: grid;
  place-items: center;
  font-size: 11.5px;
  font-weight: 700;
  flex-shrink: 0;
}
</style>
