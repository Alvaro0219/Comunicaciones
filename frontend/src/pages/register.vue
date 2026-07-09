<template>
  <div class="gda-auth-page">
    <q-card flat bordered class="gda-auth-card">
      <q-card-section class="text-center">
        <q-icon name="psychology" size="42px" color="primary" />
        <div class="gda-auth-title">Crear cuenta</div>
        <div class="gda-auth-subtitle">Gestioná tus macetas con riego inteligente</div>
      </q-card-section>

      <q-card-section class="q-gutter-y-md">
        <q-input v-model="fullName" label="Nombre completo" outlined dense />
        <q-input v-model="email" label="Email" type="email" outlined dense />
        <q-input
          v-model="password" label="Contraseña (mín. 8 caracteres)" outlined dense
          :type="showPass ? 'text' : 'password'"
        >
          <template #append>
            <q-icon
              :name="showPass ? 'visibility_off' : 'visibility'"
              class="cursor-pointer" @click="showPass = !showPass"
            />
          </template>
        </q-input>
        <q-btn
          color="primary" class="full-width" label="Registrarme" size="md"
          :loading="loading" @click="submit"
        />
      </q-card-section>

      <q-card-section class="text-center text-caption text-grey-7">
        ¿Ya tenés cuenta?
        <router-link to="/login" class="text-primary">Iniciá sesión</router-link>
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
