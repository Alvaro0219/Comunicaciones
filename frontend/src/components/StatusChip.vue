<template>
  <span class="gda-chip" :class="`gda-chip--${tone}`">
    <q-icon v-if="icon" :name="icon" />
    <i v-else-if="dot" aria-hidden="true" />
    <slot>{{ label }}</slot>
  </span>
</template>

<script setup>
defineProps({
  label: { type: String, default: '' },
  tone: { type: String, default: 'neutral' },
  icon: { type: String, default: '' },
  dot: { type: Boolean, default: true }
});
</script>
