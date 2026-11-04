<template>
  <AuthLayout>
    <template #claim>Sumá tus zonas al gemelo digital.</template>
    <template #description>
      Creá tu cuenta, registrá tus nodos ESP32 y empezá a ver
      cada riego, lectura y alerta en un solo lugar.
    </template>

    <h2 class="gda-auth-title">Crear cuenta</h2>
    <p class="gda-auth-sub">Vas a poder gestionar tus propias zonas desde el primer inicio de sesión.</p>

    <q-form class="gda-auth-fields" @submit.prevent="submit">
      <q-input v-model="fullName" label="Nombre completo" outlined autocomplete="name">
        <template #prepend><q-icon name="badge" /></template>
      </q-input>
      <q-input v-model="email" label="Email" type="email" outlined autocomplete="email">
        <template #prepend><q-icon name="alternate_email" /></template>
      </q-input>
      <q-input
        v-model="password" label="Contraseña" outlined autocomplete="new-password"
        hint="Mínimo 8 caracteres" :type="showPass ? 'text' : 'password'"
      >
        <template #prepend><q-icon name="lock" /></template>
        <template #append>
          <q-icon
            :name="showPass ? 'visibility_off' : 'visibility'"
            class="cursor-pointer" @click="showPass = !showPass"
          />
        </template>
      </q-input>

      <q-btn
        type="submit" color="primary" class="full-width gda-auth-submit" no-caps unelevated size="lg"
        label="Crear mi cuenta" icon-right="arrow_forward" :loading="loading"
      />
    </q-form>

    <p class="gda-auth-switch">
      ¿Ya tenés cuenta?
      <router-link to="/login">Iniciá sesión</router-link>
    </p>
  </AuthLayout>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '../stores/auth.js';
import AuthLayout from '../components/AuthLayout.vue';

const $q = useQuasar();
const router = useRouter();
const auth = useAuthStore();

const fullName = ref('');
const email = ref('');
const password = ref('');
const showPass = ref(false);
const loading = ref(false);

async function submit() {
  if (!fullName.value || !email.value || password.value.length < 8) {
    $q.notify({ type: 'warning', message: 'Completá todos los campos (contraseña de 8+ caracteres)' });
    return;
  }
  loading.value = true;
  try {
    await auth.register({ fullName: fullName.value, email: email.value, password: password.value });
    router.push('/dashboard');
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudo registrar' });
  } finally {
    loading.value = false;
  }
}
</script>
