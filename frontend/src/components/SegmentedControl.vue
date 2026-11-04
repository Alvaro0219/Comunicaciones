<template>
  <div class="gda-seg" role="group" :aria-label="label">
    <button
      v-for="o in options" :key="o.value" type="button"
      :aria-pressed="String(o.value === modelValue)"
      @click="$emit('update:modelValue', o.value)"
    >
      <q-icon v-if="o.icon" :name="o.icon" size="16px" />
      {{ o.label }}
      <span v-if="o.count != null" class="gda-seg-count">{{ o.count }}</span>
    </button>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: [String, Number, Boolean], default: '' },
  options: { type: Array, required: true },
  label: { type: String, default: '' }
});
defineEmits(['update:modelValue']);
</script>
