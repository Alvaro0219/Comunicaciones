import { ref } from 'vue';
import { useQuasar } from 'quasar';

export function useCrudResource({ fetchFn, createFn, updateFn, deleteFn, idKey = '_id', label = 'registro' }) {
  const $q = useQuasar();
  const items = ref([]);
  const loading = ref(false);
  const saving = ref(false);

  async function reload(...args) {
    loading.value = true;
    try {
      items.value = await fetchFn(...args);
    } catch (e) {
      $q.notify({ type: 'negative', message: e.message || `No se pudo cargar ${label}` });
    } finally {
      loading.value = false;
    }
  }

  async function create(payload) {
    saving.value = true;
    try {
      const created = await createFn(payload);
      await reload();
      return created || true;
    } catch (e) {
      $q.notify({ type: 'negative', message: e.message || `No se pudo crear ${label}` });
      return false;
    } finally {
      saving.value = false;
    }
  }

  async function update(id, payload) {
    saving.value = true;
    try {
      await updateFn(id, payload);
      await reload();
      return true;
    } catch (e) {
      $q.notify({ type: 'negative', message: e.message || `No se pudo actualizar ${label}` });
      return false;
    } finally {
      saving.value = false;
    }
  }

  async function remove(id) {
    saving.value = true;
    try {
      await deleteFn(id);
      await reload();
      return true;
    } catch (e) {
      $q.notify({ type: 'negative', message: e.message || `No se pudo eliminar ${label}` });
      return false;
    } finally {
      saving.value = false;
    }
  }

  return { items, loading, saving, reload, create, update, remove, idKey };
}
