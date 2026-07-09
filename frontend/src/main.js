import { createApp } from 'vue';
import { Quasar, Notify } from 'quasar';
import { createPinia } from 'pinia';
import router from './router/index.js';
import App from './App.vue';
import 'quasar/dist/quasar.css';
import '@quasar/extras/material-icons/material-icons.css';
import './styles/app.css';

const app = createApp(App);
app.use(Quasar, { plugins: { Notify } });
app.use(createPinia());
app.use(router);

app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue error]', err, info);
  Notify.create({ type: 'negative', message: 'Ocurrió un error inesperado. Intenta de nuevo.' });
};

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled promise rejection]', event.reason);
  Notify.create({ type: 'negative', message: 'Ocurrió un error inesperado. Intenta de nuevo.' });
});

app.mount('#app');
