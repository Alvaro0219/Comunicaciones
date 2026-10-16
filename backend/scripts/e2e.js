// Prueba de punta a punta contra el broker que esté configurado en backend/.env.
//
//   cd backend && npm run e2e        (con el backend corriendo: npm run dev)
//
// Qué hace, con las variables MQTT de tu .env (credencial, TOPIC_PREFIX, MODO_ESCRITURA):
//   1. Se loguea en la API como admin y crea una maceta temporal con un Node ID propio (e2e-xxxx).
//   2. Emula al firmware v2 contra el HiveMQ REAL: publica telemetría, recibe las órdenes
//      activar_riego, "riega" por el tiempo pedido y confirma con los eventos de bomba.
//   3. Verifica por la API lo que vería un usuario: lectura en vivo, decisión automática, espera
//      entre riegos, riego manual, SSE, permisos por rol, CORS estricto.
//
// Seguro con el prefijo real (gda/prod) y con MODO_ESCRITURA=true: la maceta usa un Node ID que
// el nodo físico no escucha, así que NUNCA activa la bomba real.
// Deja una maceta eliminada (inactiva) y un usuario inactivo "e2e-*" en la base: usarlo contra la
// base de desarrollo, no contra una de producción.
//
// Variables propias de la prueba (el resto sale de backend/.env):
//   E2E_API_URL         API a probar (default: http://localhost:$PORT)
//   E2E_ADMIN_EMAIL     un admin que ya exista en la base (npm run seed:admin -- <email> <pass> "Nombre")
//   E2E_ADMIN_PASSWORD

import mqtt from 'mqtt';
import { env } from '../src/config/env.js';

const API = (process.env.E2E_API_URL || `http://localhost:${env.port}`).replace(/\/$/, '');
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Faltan E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD (un admin que exista en la base de tu .env).');
  process.exit(1);
}
if (!env.mqtt.host || !env.mqtt.user) {
  console.error('Falta la credencial de HiveMQ (MQTT_HOST / MQTT_USER / MQTT_PASS) en la configuración.');
  process.exit(1);
}

const WRITE = env.mqtt.writeMode;
const COOLDOWN_MIN = env.decisionCooldownMin;
const runId = Date.now().toString(36);
const nodeId = `e2e-${runId}`;
const PREFIX = env.mqtt.topicPrefix;

let failures = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `  -> ${extra}`}`);
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Reintenta fn() cada `interval` ms hasta que devuelva algo "truthy" o venza el plazo.
async function waitFor(fn, { timeout = 20000, interval = 1000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await sleep(interval);
  }
  return null;
}

async function api(method, path, { token, body, headers } = {}) {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch { /* sin cuerpo */ }
  return { status: res.status, body: json, headers: res.headers };
}

// ── Emulador del nodo (mismo contrato que firmware/gda-nodo-v2) ─────────────
function startNodeEmulator() {
  const state = { humedad: 40, bomba: false, commands: [], connected: false };
  const client = mqtt.connect(`mqtts://${env.mqtt.host}:${env.mqtt.port}`, {
    username: env.mqtt.user,
    password: env.mqtt.pass,
    clientId: `e2e-nodo-${runId}`,
    reconnectPeriod: 2000
  });
  const topic = (canal) => `${PREFIX}/${nodeId}/${canal}`;
  const publish = (canal, obj) => client.publish(topic(canal), JSON.stringify(obj), { qos: 1 });

  client.on('connect', () => {
    state.connected = true;
    client.subscribe(topic('comando'), { qos: 1 });
  });
  client.on('error', (err) => console.error('  [nodo emulado] error MQTT:', err.message));

  client.on('message', (_t, buf) => {
    let cmd;
    try { cmd = JSON.parse(buf.toString()); } catch { return; }
    state.commands.push(cmd);
    if (cmd.activar_riego === true) {
      const dur = Math.min(Math.round(cmd.duracion_seg || 0), 120); // tope duro del firmware
      if (dur < 1 || state.bomba) return;
      state.bomba = true;
      publish('evento', { maceta_id: 1, bomba: true, humedad: Math.round(state.humedad), motivo: 'orden de riego', commandId: cmd.commandId });
      setTimeout(() => {
        state.bomba = false;
        state.humedad = Math.min(100, state.humedad + 30);
        publish('evento', { maceta_id: 1, bomba: false, humedad: Math.round(state.humedad), motivo: 'fin de riego', duracion_seg: dur, commandId: cmd.commandId });
      }, dur * 1000);
    }
  });

  const timer = setInterval(() => {
    if (!state.connected) return;
    publish('telemetria', {
      maceta_id: 1,
      humedad: Math.round(state.humedad),
      temp_ambiente: 24.5, // AM2302
      hum_ambiente: 60,
      bomba: state.bomba,
      rssi: -60, ssid: 'e2e', ip: '10.0.0.1', heap: 200000
    });
  }, 2000);

  return { state, stop: () => { clearInterval(timer); client.end(true); } };
}

// Abre el stream SSE como lo hace el navegador y espera un evento 'reading'
async function sseRecibeLectura(token) {
  const t = await api('POST', '/stream/token', { token });
  if (!t.body?.data?.token) return false;
  const ctrl = new AbortController();
  try {
    const res = await fetch(`${API}/api/stream?token=${encodeURIComponent(t.body.data.token)}`, { signal: ctrl.signal });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const deadline = Date.now() + 15000;
    let buffer = '';
    while (Date.now() < deadline) {
      const chunk = await Promise.race([reader.read(), sleep(Math.max(0, deadline - Date.now())).then(() => ({ done: true }))]);
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      if (buffer.includes('event: reading')) return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    ctrl.abort();
  }
}

// ── Ensayo ────────────────────────────────────────────────────────────────────
console.log(`\nEnsayo e2e contra ${API}`);
console.log(`Prefijo ${PREFIX} | MODO_ESCRITURA=${WRITE} | espera entre riegos=${COOLDOWN_MIN} min | nodo emulado "${nodeId}"\n`);

let node = null;
let token = null;
let potId = null;
let viewerId = null;

try {
  // 1. API arriba y autenticación
  const health = await fetch(`${API}/health`).then((r) => r.json()).catch(() => null);
  check('S1 /health responde {"ok":true}', health?.ok === true, JSON.stringify(health));

  const noAuth = await api('GET', '/pots');
  check('S2 sin token la API rechaza (401)', noAuth.status === 401, `status ${noAuth.status}`);

  const login = await api('POST', '/auth/login', { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  token = login.body?.data?.accessToken;
  check('S3 login del admin', !!token, `status ${login.status} ${JSON.stringify(login.body?.error)}`);
  if (!token) throw new Error('Sin login no se puede seguir. ¿El email y la contraseña corresponden a un admin de la base de tu .env?');

  // 2. CORS estricto, como en producción
  check('S4 CORS_ORIGINS no está vacío (vacío permitiría cualquier origen)', env.corsOrigins.length > 0);
  if (env.corsOrigins.length > 0) {
    const bad = await fetch(`${API}/api/pots`, { method: 'OPTIONS', headers: { Origin: 'https://sitio-ajeno.example', 'Access-Control-Request-Method': 'GET' } });
    check('S5 un origen ajeno NO recibe cabecera CORS', !bad.headers.get('access-control-allow-origin'), `recibió ${bad.headers.get('access-control-allow-origin')}`);
    const good = await fetch(`${API}/api/pots`, { method: 'OPTIONS', headers: { Origin: env.corsOrigins[0], 'Access-Control-Request-Method': 'GET' } });
    check('S6 el origen del frontend SÍ recibe cabecera CORS', good.headers.get('access-control-allow-origin') === env.corsOrigins[0], `recibió ${good.headers.get('access-control-allow-origin')}`);
  }

  // 3. Maceta temporal y nodo emulado
  const created = await api('POST', '/pots', { token, body: { name: `E2E ${runId}`, nodeId, minMoisture: 50, maxMoisture: 70, irrigationDurationSec: 3 } });
  potId = created.body?.data?._id;
  check('P1 se crea la maceta temporal', created.status === 201 && !!potId, `status ${created.status} ${JSON.stringify(created.body?.error)}`);
  if (!potId) throw new Error('No se pudo crear la maceta');

  node = startNodeEmulator();
  const online = await waitFor(async () => {
    const p = await api('GET', `/pots/${potId}`, { token });
    return p.body?.data?.online && p.body?.data?.lastReading?.soilMoisture != null ? p.body.data : null;
  }, { timeout: 30000 });
  check('P2 el backend recibe la telemetría por HiveMQ (maceta online con lectura)', !!online, 'sin lectura en 30 s: revisar credencial/prefijo MQTT y los logs del backend');
  if (!online) throw new Error('La telemetría no llega al backend');
  check('P2b la temperatura y la humedad del aire (AM2302) llegan hasta la maceta', online.lastReading?.temperature === 24.5 && online.lastReading?.airHumidity === 60, JSON.stringify(online.lastReading));

  check('P3 SSE: el navegador recibiría la lectura en vivo', await sseRecibeLectura(token));

  const listEvents = async () => (await api('GET', `/pots/${potId}/events?limit=50`, { token })).body?.data?.items || [];

  if (WRITE) {
    // 4a. Decisión automática: la humedad (40) está bajo el mínimo (50)
    const auto = await waitFor(async () => (await listEvents()).find((e) => e.type === 'riego_activado' && e.result === 'confirmado'), { timeout: 30000 });
    check('A1 humedad bajo el mínimo => el backend ordena, el nodo riega y la orden queda confirmada', !!auto, 'sin riego confirmado en 30 s');
    check('A2 el nodo recibió exactamente UNA orden', node.state.commands.length === 1 && node.state.commands[0].activar_riego === true && node.state.commands[0].duracion_seg === 3, JSON.stringify(node.state.commands));
    // El evento figura confirmado un instante antes de que se guarde "Último riego": se espera.
    const afterAuto = await waitFor(async () => {
      const p = (await api('GET', `/pots/${potId}`, { token })).body?.data;
      return p?.lastIrrigation ? p : null;
    }, { timeout: 10000, interval: 500 });
    check('A3 "Último riego" refleja la duración real (3 s) y el origen automático', afterAuto?.lastIrrigation?.durationSec === 3 && afterAuto?.lastIrrigation?.origin === 'auto', JSON.stringify(afterAuto?.lastIrrigation));

    // 4b. Espera entre riegos: la humedad vuelve a bajar pero NO se vuelve a regar
    if (COOLDOWN_MIN > 0) {
      // Primero el backend tiene que ver la humedad ya regada (70 %, en rango): ahí se resuelve la
      // alerta crítica. Recién después se baja de nuevo, y la alerta nueva nace dentro de la espera.
      const listAlerts = async () => (await api('GET', `/alerts?potId=${potId}&status=activa`, { token })).body?.data?.items || [];
      const resuelta = await waitFor(async () => (await listAlerts()).every((a) => a.type !== 'critica'), { timeout: 15000, interval: 1000 });
      check('A3b con la humedad ya regada (en rango) la alerta crítica se resuelve sola', !!resuelta, 'la alerta crítica sigue activa');
      node.state.humedad = 35;
      await sleep(9000);
      const eventsNow = await listEvents();
      check('A4 con la humedad otra vez baja NO se riega de nuevo durante la espera', node.state.commands.length === 1 && eventsNow.filter((e) => e.type === 'riego_activado').length === 1, `ordenes=${node.state.commands.length}`);
      const critica = (await listAlerts()).find((a) => a.type === 'critica');
      check('A5 la alerta crítica sigue visible y avisa que espera el efecto del riego', !!critica && /esperando/.test(critica.message), critica?.message);
    }

    // 4c. Riego manual: ignora la espera, no se solapa con otro en curso
    const manual = await api('POST', `/pots/${potId}/irrigate`, { token, body: { durationSec: 2 } });
    check('M1 "Regar ahora" acepta la orden (202)', manual.status === 202, `status ${manual.status} ${JSON.stringify(manual.body?.error)}`);
    const second = await api('POST', `/pots/${potId}/irrigate`, { token, body: { durationSec: 2 } });
    check('M2 una segunda orden mientras se riega se rechaza (409)', second.status === 409 && second.body?.error?.code === 'IRRIGATION_IN_PROGRESS', `status ${second.status} ${second.body?.error?.code}`);
    const man = await waitFor(async () => (await listEvents()).find((e) => e.type === 'riego_manual' && e.result === 'confirmado'), { timeout: 20000 });
    check('M3 el riego manual queda confirmado por el evento de bomba del nodo', !!man, 'sin confirmación en 20 s');
    const afterMan = (await api('GET', `/pots/${potId}`, { token })).body?.data;
    check('M4 "Último riego" = manual de 2 s', afterMan?.lastIrrigation?.origin === 'manual' && afterMan?.lastIrrigation?.durationSec === 2, JSON.stringify(afterMan?.lastIrrigation));
  } else {
    // 4. Modo lectura: decide y registra, pero NO ordena
    const ro = await waitFor(async () => (await listEvents()).find((e) => /modo lectura/.test(e.message || '')), { timeout: 30000 });
    check('L1 humedad bajo el mínimo => se registra "[modo lectura] riego omitido"', !!ro, 'sin evento en 30 s');
    await sleep(9000);
    const roEvents = (await listEvents()).filter((e) => /modo lectura/.test(e.message || ''));
    check('L2 el evento se registra UNA vez, no uno por lectura', roEvents.length === 1, `eventos=${roEvents.length}`);
    check('L3 el nodo NO recibió ninguna orden', node.state.commands.length === 0, JSON.stringify(node.state.commands));
    const manual = await api('POST', `/pots/${potId}/irrigate`, { token, body: { durationSec: 2 } });
    check('L4 "Regar ahora" avisa que el backend está en modo lectura (409 READ_ONLY)', manual.status === 409 && manual.body?.error?.code === 'READ_ONLY', `status ${manual.status} ${manual.body?.error?.code}`);
  }

  // 5. Permisos por rol
  const viewerEmail = `e2e-viewer-${runId}@ensayo.invalid`;
  const viewerPass = `Vw-${runId}-${Math.random().toString(36).slice(2, 10)}`;
  const mk = await api('POST', '/users', { token, body: { email: viewerEmail, password: viewerPass, fullName: 'E2E Visualizador', role: 'visualizador' } });
  viewerId = mk.body?.data?._id;
  check('R1 el admin crea un usuario visualizador', mk.status === 201 && !!viewerId, `status ${mk.status}`);
  if (viewerId) {
    const vlogin = await api('POST', '/auth/login', { body: { email: viewerEmail, password: viewerPass } });
    const vtoken = vlogin.body?.data?.accessToken;
    const vIrrigate = await api('POST', `/pots/${potId}/irrigate`, { token: vtoken, body: { durationSec: 2 } });
    check('R2 un visualizador NO puede regar (403)', vIrrigate.status === 403, `status ${vIrrigate.status}`);
    const vPots = await api('GET', '/pots', { token: vtoken });
    check('R3 un visualizador no ve las macetas de otros usuarios', vPots.status === 200 && (vPots.body?.data?.items || []).length === 0, `items=${vPots.body?.data?.items?.length}`);
    const vUsers = await api('GET', '/users', { token: vtoken });
    check('R4 un visualizador NO accede a la gestión de usuarios (403)', vUsers.status === 403, `status ${vUsers.status}`);
  }
} catch (err) {
  failures++;
  console.error(`\nERROR: ${err.message}`);
} finally {
  node?.stop();
  if (potId) await api('DELETE', `/pots/${potId}`, { token }).catch(() => {});
  if (viewerId) await api('PUT', `/users/${viewerId}`, { token, body: { isActive: false } }).catch(() => {});
}

console.log(failures === 0 ? '\nRESULTADO: TODO OK' : `\nRESULTADO: ${failures} FALLO(S)`);
process.exit(failures === 0 ? 0 : 1);
