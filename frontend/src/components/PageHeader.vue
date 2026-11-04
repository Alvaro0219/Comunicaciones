<template>
  <header class="gda-page-header">
    <div class="gda-page-heading">
      <div v-if="icon" class="gda-page-icon"><q-icon :name="icon" size="24px" /></div>
      <div>
        <h1 class="gda-page-title"><slot name="title">{{ title }}</slot></h1>
        <p v-if="subtitle || $slots.subtitle" class="gda-page-subtitle"><slot name="subtitle">{{ subtitle }}</slot></p>
      </div>
    </div>
    <div v-if="$slots.default" class="gda-page-actions"><slot /></div>
  </header>
</template>

<script setup>
defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  icon: { type: String, default: '' }
});
</script>
