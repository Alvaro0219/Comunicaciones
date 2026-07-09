<template>
  <!-- Marca GDA: gota de agua con brote adentro -->
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 2.5C8.3 7.2 5.5 10.7 5.5 14.2a6.5 6.5 0 0 0 13 0C18.5 10.7 15.7 7.2 12 2.5Z"
      stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"
    />
    <path
      d="M12 17.5v-4.2m0 0c0-2.2 1.7-3.3 3.4-3.3 0 2.2-1.4 3.3-3.4 3.3Zm0 0c0-2.2-1.7-3.3-3.4-3.3 0 2.2 1.4 3.3 3.4 3.3Z"
      stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"
    />
  </svg>
</template>

<script setup>
defineProps({
  size: { type: Number, default: 26 }
});
</script>
