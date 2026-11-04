<template>
  <AuthLayout>
    <template #claim>Cada zona, medida y regada a tiempo.</template>
    <template #description>
      Sensores en las macetas, pronóstico meteorológico y un motor de decisión
      que riega solo cuando hace falta.
    </template>

    <h2 class="gda-auth-title">Iniciar sesión</h2>
    <p class="gda-auth-sub">Accedé al estado de tus zonas de riego en tiempo real.</p>

    <q-banner v-if="reason" dense rounded class="gda-auth-banner">
      Tu sesión expiró. Iniciá sesión nuevamente.
    </q-banner>

    <q-form class="gda-auth-fields" @submit.prevent="submit">
      <q-input v-model="email" label="Email" type="email" outlined autocomplete="email">
        <template #prepend><q-icon name="alternate_email" /></template>
      </q-input>
      <q-input
        v-model="password" label="Contraseña" outlined autocomplete="current-password"
        :type="showPass ? 'text' : 'password'"
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
        label="Ingresar" icon-right="arrow_forward" :loading="loading"
      />
    </q-form>

    <p class="gda-auth-switch">
      ¿No tenés cuenta?
      <router-link to="/register">Registrate</router-link>
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

const email = ref('');
const password = ref('');
const showPass = ref(false);
const loading = ref(false);
const reason = ref(sessionStorage.getItem('gda_login_reason'));
sessionStorage.removeItem('gda_login_reason');

async function submit() {
  if (!email.value || !password.value) return;
  loading.value = true;
  try {
    await auth.login(email.value, password.value);
    router.push('/dashboard');
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message || 'No se pudo iniciar sesión' });
  } finally {
    loading.value = false;
  }
}
</script>

<style>
/* Compartido por login y registro (el contenido va en el slot del layout) */
.gda-auth-title { font-family: var(--gda-font-display); font-size: 28px; font-weight: 800; letter-spacing: -0.015em; margin: 0 0 6px; color: var(--gda-ink); }
.gda-auth-sub { font-size: 14px; color: var(--gda-ink-soft); margin: 0 0 24px; line-height: 1.5; }
.gda-auth-banner { background: #FBF3E4; color: #7A5A18; margin-bottom: 18px; }
.gda-auth-fields { display: flex; flex-direction: column; gap: 16px; }
.gda-auth-submit { margin-top: 6px; font-size: 15px; }
.gda-auth-switch { margin: 22px 0 0; font-size: 13.5px; color: var(--gda-ink-soft); text-align: center; }
.gda-auth-switch a { color: var(--gda-leaf); font-weight: 600; text-decoration: none; }
.gda-auth-switch a:hover { text-decoration: underline; }
</style>
