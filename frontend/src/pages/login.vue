<template>
  <div class="gda-auth-page">
    <q-card flat bordered class="gda-auth-card">
      <q-card-section class="text-center">
        <q-icon name="psychology" size="42px" color="primary" />
        <div class="gda-auth-title">Gemelo Digital Agrícola</div>
        <div class="gda-auth-subtitle">Riego automatizado inteligente</div>
      </q-card-section>

      <q-banner v-if="reason" dense class="bg-orange-1 text-orange-9 q-mx-md" rounded>
        Tu sesión expiró. Iniciá sesión nuevamente.
      </q-banner>

      <q-card-section class="q-gutter-y-md">
        <q-input v-model="email" label="Email" type="email" outlined dense @keyup.enter="submit" />
        <q-input
          v-model="password" label="Contraseña" outlined dense
          :type="showPass ? 'text' : 'password'"
          @keyup.enter="submit"
        >
          <template #append>
            <q-icon
              :name="showPass ? 'visibility_off' : 'visibility'"
              class="cursor-pointer" @click="showPass = !showPass"
            />
          </template>
        </q-input>
        <q-btn
          color="primary" class="full-width" label="Ingresar" size="md"
          :loading="loading" @click="submit"
        />
      </q-card-section>

      <q-card-section class="text-center text-caption text-grey-7">
        ¿No tenés cuenta?
        <router-link to="/register" class="text-primary">Registrate</router-link>
      </q-card-section>
    </q-card>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '../stores/auth.js';

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

<style scoped>
.gda-auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, #f0fdf4 0%, #f8fafc 60%);
  padding: 16px;
}
.gda-auth-card { width: 380px; max-width: 100%; border-radius: 14px; }
.gda-auth-title { font-size: 19px; font-weight: 800; color: #0f172a; margin-top: 6px; }
.gda-auth-subtitle { font-size: 13px; color: #64748b; }
</style>
