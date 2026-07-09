<template>
  <div class="gda-auth">
    <section class="gda-auth-panel">
      <div class="gda-auth-brand">
        <BrandMark :size="34" class="gda-auth-mark" />
        <span class="gda-auth-logo">GDA</span>
      </div>
      <h1 class="gda-auth-claim">Sumá tus macetas <br />al gemelo digital.</h1>
      <p class="gda-auth-desc">
        Creá tu cuenta, registrá tus nodos ESP32 y empezá a ver
        cada riego, lectura y alerta en un solo lugar.
      </p>
      <div class="gda-auth-drips" aria-hidden="true"><i /><i /><i /></div>
    </section>

    <section class="gda-auth-form">
      <div class="gda-auth-form-inner">
        <h2 class="gda-auth-title">Crear cuenta</h2>
        <p class="gda-auth-sub">Vas a poder gestionar tus propias macetas desde el primer login.</p>

        <q-input v-model="fullName" label="Nombre completo" outlined dense class="q-mb-md" />
        <q-input v-model="email" label="Email" type="email" outlined dense class="q-mb-md" />
        <q-input
          v-model="password" label="Contraseña (mín. 8 caracteres)" outlined dense class="q-mb-lg"
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
          color="primary" class="full-width" label="Registrarme" size="md" unelevated
          :loading="loading" @click="submit"
        />

        <p class="gda-auth-switch">
          ¿Ya tenés cuenta?
          <router-link to="/login">Iniciá sesión</router-link>
        </p>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from '../stores/auth.js';
import BrandMark from '../components/BrandMark.vue';

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
.gda-auth { display: flex; min-height: 100vh; }

.gda-auth-panel {
  position: relative;
  width: 44%;
  background: linear-gradient(170deg, var(--gda-pine) 0%, var(--gda-pine-deep) 100%);
  color: #E9F1E7;
  padding: 48px 52px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.gda-auth-brand { display: flex; align-items: center; gap: 12px; }
.gda-auth-mark { color: var(--gda-leaf-bright); }
.gda-auth-logo {
  font-family: var(--gda-font-display);
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.05em;
}
.gda-auth-claim {
  font-family: var(--gda-font-display);
  font-size: clamp(30px, 3.4vw, 44px);
  font-weight: 800;
  line-height: 1.12;
  letter-spacing: -0.01em;
  margin: auto 0 18px;
}
.gda-auth-desc {
  font-size: 14.5px;
  line-height: 1.6;
  color: rgba(233, 241, 231, 0.72);
  max-width: 340px;
  margin: 0 0 auto;
}

.gda-auth-drips {
  position: absolute;
  top: 0;
  right: 56px;
  bottom: 0;
  width: 40px;
  pointer-events: none;
}
.gda-auth-drips i {
  position: absolute;
  width: 5px;
  height: 12px;
  border-radius: 3px;
  background: rgba(127, 201, 143, 0.35);
  animation: gda-fall 7s linear infinite;
}
.gda-auth-drips i:nth-child(1) { left: 0; animation-delay: 0s; }
.gda-auth-drips i:nth-child(2) { left: 16px; animation-delay: 2.4s; }
.gda-auth-drips i:nth-child(3) { left: 32px; animation-delay: 4.8s; }
@keyframes gda-fall {
  0% { top: -6%; opacity: 0; }
  12% { opacity: 1; }
  88% { opacity: 1; }
  100% { top: 104%; opacity: 0; }
}

.gda-auth-form {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  background: var(--gda-mist);
}
.gda-auth-form-inner { width: 360px; max-width: 100%; }
.gda-auth-title {
  font-family: var(--gda-font-display);
  font-size: 26px;
  font-weight: 800;
  margin: 0 0 6px;
  color: var(--gda-ink);
}
.gda-auth-sub { font-size: 13.5px; color: var(--gda-ink-soft); margin: 0 0 26px; }
.gda-auth-switch {
  margin-top: 22px;
  font-size: 13px;
  color: var(--gda-ink-soft);
  text-align: center;
}
.gda-auth-switch a { color: var(--gda-leaf); font-weight: 600; text-decoration: none; }
.gda-auth-switch a:hover { text-decoration: underline; }

@media (max-width: 899px) {
  .gda-auth { flex-direction: column; }
  .gda-auth-panel { width: 100%; padding: 32px 28px; min-height: 220px; }
  .gda-auth-claim { margin: 22px 0 12px; font-size: 28px; }
  .gda-auth-desc { margin-bottom: 0; }
  .gda-auth-drips { display: none; }
}
</style>
