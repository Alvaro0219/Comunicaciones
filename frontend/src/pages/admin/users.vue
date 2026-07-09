<template>
  <div class="gda-page-shell">
    <div class="gda-page-header">
      <div>
        <h1 class="gda-page-title">Usuarios</h1>
        <p class="gda-page-subtitle">Gestión de usuarios y roles (solo administrador)</p>
      </div>
      <q-btn color="primary" icon="person_add" label="Nuevo usuario" @click="openCreate" />
    </div>

    <div class="gda-section-card">
      <LoadingState :loading="loading" :empty="!loading && items.length === 0" empty-label="No hay usuarios.">
        <q-table :rows="items" :columns="columns" row-key="_id" flat :pagination="{ rowsPerPage: 20 }">
          <template #body-cell-role="props">
            <q-td :props="props">
              <q-badge :color="roleColor(props.row.role)" :label="roleLabel(props.row.role)" />
            </q-td>
          </template>
          <template #body-cell-isActive="props">
            <q-td :props="props">
              <q-badge :color="props.row.isActive ? 'positive' : 'grey-5'" :label="props.row.isActive ? 'activo' : 'inactivo'" />
            </q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props">
              <q-btn flat dense round icon="edit" color="grey-8" @click="openEdit(props.row)" />
            </q-td>
          </template>
        </q-table>
      </LoadingState>
    </div>

    <q-dialog v-model="showDialog">
      <q-card style="width: 440px; max-width: 95vw">
        <q-card-section class="text-h6">{{ editing ? 'Editar usuario' : 'Nuevo usuario' }}</q-card-section>
        <q-card-section class="q-gutter-y-sm">
          <q-input v-model="form.fullName" label="Nombre completo" dense outlined />
          <q-input v-if="!editing" v-model="form.email" label="Email" type="email" dense outlined />
          <q-input
            v-model="form.password" dense outlined type="password"
            :label="editing ? 'Nueva contraseña (opcional)' : 'Contraseña'"
          />
          <q-select
            v-model="form.role" :options="roleOptions" label="Rol"
            dense outlined emit-value map-options
          />
          <q-toggle v-if="editing" v-model="form.isActive" label="Usuario activo" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn color="primary" :label="editing ? 'Guardar' : 'Crear'" :loading="saving" @click="submit" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { fetchUsers, createUser, updateUser } from '../../services/api.js';
import LoadingState from '../../components/LoadingState.vue';

const $q = useQuasar();

const items = ref([]);
const loading = ref(false);
const saving = ref(false);
const showDialog = ref(false);
const editing = ref(null);

const roleOptions = [
  { label: 'Administrador', value: 'admin' },
  { label: 'Técnico', value: 'tecnico' },
  { label: 'Visualizador', value: 'visualizador' }
];

const columns = [
  { name: 'fullName', label: 'Nombre', field: 'fullName', align: 'left', sortable: true },
  { name: 'email', label: 'Email', field: 'email', align: 'left' },
  { name: 'role', label: 'Rol', field: 'role', align: 'center' },
  { name: 'isActive', label: 'Estado', field: 'isActive', align: 'center' },
  { name: 'actions', label: '', field: '_id', align: 'right' }
];

const form = reactive({ fullName: '', email: '', password: '', role: 'visualizador', isActive: true });

function roleLabel(r) {
  return roleOptions.find(o => o.value === r)?.label || r;
}
function roleColor(r) {
  return { admin: 'deep-purple', tecnico: 'primary', visualizador: 'blue-grey' }[r] || 'grey';
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
  Object.assign(form, { fullName: '', email: '', password: '', role: 'visualizador', isActive: true });
  showDialog.value = true;
}

function openEdit(user) {
  editing.value = user;
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
