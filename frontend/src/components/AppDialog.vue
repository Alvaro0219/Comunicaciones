<template>
  <q-dialog
    :model-value="modelValue"
    :maximized="$q.screen.lt.sm"
    :transition-show="$q.screen.lt.sm ? 'slide-up' : 'scale'"
    :transition-hide="$q.screen.lt.sm ? 'slide-down' : 'scale'"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <q-card class="gda-dialog" :style="{ width: width }">
      <header class="gda-dialog-head">
        <div v-if="icon" class="gda-dialog-icon" :class="`gda-dialog-icon--${tone}`">
          <q-icon :name="icon" size="22px" />
        </div>
        <div class="gda-dialog-heading">
          <h2 class="gda-dialog-title">{{ title }}</h2>
          <p v-if="subtitle" class="gda-dialog-subtitle">{{ subtitle }}</p>
        </div>
        <q-btn flat round dense icon="close" aria-label="Cerrar" @click="$emit('update:modelValue', false)" />
      </header>

      <div class="gda-dialog-body"><slot /></div>

      <footer class="gda-dialog-foot">
        <slot name="footer-start" />
        <span class="gda-dialog-spacer" />
        <q-btn flat no-caps :label="cancelLabel" color="grey-8" @click="$emit('update:modelValue', false)" />
        <q-btn
          v-if="submitLabel" unelevated no-caps :color="danger ? 'negative' : 'primary'"
          :label="submitLabel" :loading="loading" :disable="disabled" @click="$emit('submit')"
        />
      </footer>
    </q-card>
  </q-dialog>
</template>

<script setup>
// Carcasa común de los diálogos: encabezado con ícono, cuerpo con scroll y pie fijo.
// En móvil ocupa toda la pantalla.
defineProps({
  modelValue: Boolean,
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  icon: { type: String, default: '' },
  tone: { type: String, default: 'leaf' },
  width: { type: String, default: '620px' },
  submitLabel: { type: String, default: '' },
  cancelLabel: { type: String, default: 'Cancelar' },
  loading: Boolean,
  disabled: Boolean,
  danger: Boolean
});
defineEmits(['update:modelValue', 'submit']);
</script>

<style scoped>
.gda-dialog {
  max-width: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  background: var(--gda-card);
}
.gda-dialog-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--gda-hairline);
  background: #F6F9F4;
}
.gda-dialog-icon {
  width: 42px;
  height: 42px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: var(--gda-pine);
  color: var(--gda-leaf-bright);
}
.gda-dialog-icon--water { background: var(--gda-water); color: #fff; }
.gda-dialog-icon--danger { background: var(--gda-clay); color: #fff; }
.gda-dialog-heading { flex: 1; min-width: 0; }
.gda-dialog-title {
  font-family: var(--gda-font-display);
  font-size: 19px;
  font-weight: 800;
  letter-spacing: -0.01em;
  margin: 0;
  color: var(--gda-ink);
}
.gda-dialog-subtitle { margin: 2px 0 0; font-size: 13px; color: var(--gda-ink-soft); }
.gda-dialog-body { flex: 1; overflow-y: auto; padding: 8px 20px 12px; }
.gda-dialog-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 20px;
  border-top: 1px solid var(--gda-hairline);
  background: #F6F9F4;
}
.gda-dialog-spacer { flex: 1; }

@media (max-width: 599px) {
  .gda-dialog { border-radius: 0; }
  .gda-dialog-body { padding: 8px 16px 12px; }
  .gda-dialog-head, .gda-dialog-foot { padding-left: 16px; padding-right: 16px; }
}
</style>
