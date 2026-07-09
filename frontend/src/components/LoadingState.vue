<template>
  <div v-if="loading" class="app-loading-state">
    <q-spinner color="primary" size="32px" />
    <span v-if="label">{{ label }}</span>
  </div>
  <div v-else-if="empty" class="app-empty-state">
    <q-icon :name="emptyIcon" size="40px" color="grey-5" />
    <span>{{ emptyLabel }}</span>
  </div>
  <slot v-else />
</template>

<script setup>
defineProps({
  loading: Boolean,
  empty: Boolean,
  label: { type: String, default: 'Cargando...' },
  emptyLabel: { type: String, default: 'No hay datos para mostrar.' },
  emptyIcon: { type: String, default: 'inbox' }
});
</script>
