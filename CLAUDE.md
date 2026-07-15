# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

```bash
# Backend (API + cliente MQTT contra HiveMQ) — requiere MONGO_URL y sección MQTT en backend/.env
cd backend && npm run dev                 # node --watch, puerto 4000
npm run seed:admin -- <email> <pass> "Nombre"   # crea/promueve el usuario admin

# Frontend (dashboard)
cd frontend && npm run dev                # Vite, puerto 5173
npm run build                             # build de producción (verificación rápida de errores)

# Simulador del nodo (mismo contrato que el firmware real, contra HiveMQ)
cd simulator && node index.js --host <HIVEMQ_HOST> --user gda_sim_x --pass <PASS> --prefix gda/dev-x [--node nodo1] [--interval 5]
```

No hay tests ni linter configurados. La verificación estándar es: `npm run build` en frontend, y arrancar el backend (si todos los módulos cargan, deben verse `MongoDB conectado` y `Conectado a HiveMQ (...)` en el log). Credenciales MQTT: documento interno del equipo ("GDA Guia Setup") — **nunca commitearlas**; van solo en `.env` (gitignoreado).

## Arquitectura

Monorepo de cuatro piezas: `backend/` (Node ESM + Express + Mongoose), `frontend/` (Vue 3 `<script setup>` + Quasar + Pinia + Vite), `simulator/` (imita al firmware real contra el broker) y `firmware/gda-nodo/` (copia de referencia del sketch del nodo real — lo mantiene quien tiene el hardware; `secrets.h` jamás se commitea, existe `secrets.h.example`). `docs/ESP32_CONNECTION_GUIDE.md` es el contrato de mensajes y `docs/GUIA_HARDWARE_FIRMWARE.md` la guía práctica del equipo — si cambia el protocolo hay que actualizar contrato, firmware y simulador juntos.

**El broker MQTT vive en la nube (HiveMQ Cloud, TLS 8883)** y el backend es un *cliente* más (`mqtt/client.js`, librería `mqtt`) — NO hay broker embebido (se eliminó Aedes cuando el equipo migró a HiveMQ). Reglas de equipo codificadas en env: `MQTT_CLIENT_ID` único por persona, `TOPIC_PREFIX` propio en desarrollo (`gda/dev-nombre`; `gda/prod` es solo del nodo real y el backend desplegado), y `MODO_ESCRITURA=false` en local (el motor evalúa y registra pero `publishCommand` no publica — solo el backend desplegado riega).

### Flujo central (el "ciclo de riego")

Es el camino que cruza casi todos los archivos del backend:

1. El nodo publica en `{PREFIX}/{nodeId}/telemetria` (contrato en español: `humedad`, `temp_ambiente`, `hum_ambiente` + diagnóstico `rssi/ssid/ip/heap`) → `mqtt/client.js` suscripto a `{PREFIX}/+/telemetria` rutea a `services/ingestService.js`, que normaliza también el contrato legado en inglés.
2. `ingestService`: mensajes **sin** `humedad` son heartbeats de diagnóstico (actualizan `online`/`diagnostics` de la maceta, no crean Reading ni corren el motor). Con `humedad`: valida rangos físicos (fuera de rango ⇒ `status: 'invalida'`, no se descarta), deduplica por índice único `{nodeId, measuredAt}` (el firmware no manda timestamp → se usa hora de recepción; si algún día manda `measuredAt`/`source:'replay'` para el RNF4, ya se respeta), actualiza `lastReading` y difunde por SSE. `temperature`/`airHumidity` pueden ser null (sensores físicos pendientes).
3. Si la lectura es válida y reciente (<10 min), corre `services/decisionService.js`: el motor de reglas (umbrales de la maceta + pronóstico cacheado de `weatherService`). **Toda decisión —incluida la de no regar o la omitida por modo lectura— crea un `Event`**; ese es un invariante del dominio. La regla de calor solo aplica si hay temperatura reportada.
4. Si decide regar, `services/irrigationService.js` chequea `isWriteMode()`: en modo lectura registra el evento `[modo lectura] riego omitido` y corta. En modo escritura crea `IrrigationCommand` (uuid) y publica `{activar_riego:true, duracion_seg, commandId}` en `{PREFIX}/{nodeId}/comando`. La confirmación llega por `{PREFIX}/{nodeId}/evento` (`{evento:'riego_exitoso'}`, sin commandId en el firmware actual → se matchea el comando pendiente más reciente del nodo; con commandId, exacto). Sin confirmación en `COMMAND_TIMEOUT_SEC`, el job de `jobs/scheduler.js` la expira. El riego manual (`POST /pots/:id/irrigate`) entra por el mismo circuito (`origin:'manual'`; devuelve 409 `READ_ONLY` en modo lectura).
5. Cada paso emite eventos SSE vía `realtime/sseHub.js`; el hub filtra por dueño (admin recibe todo, el resto solo sus macetas).

Para evitar ciclos de imports, `mqtt/client.js` no importa services: recibe los handlers (`onTelemetry`, `onEvent`) por parámetro desde `app.js`. `irrigationService` sí importa `publishCommand`/`isWriteMode` del cliente. El campo `Pot.deviceToken` quedó vestigial (la auth MQTT es contra HiveMQ, no contra nuestra DB); la asociación mensaje→maceta es por `Pot.nodeId` = segmento del topic.

### Convenciones backend (estrictas, vienen de la skill de arquitectura)

- Capas: `routes → controllers → services → models`. Los controllers no llevan try/catch (usan `asyncHandler` + error handler global en `app.js`) ni instancian Joi (la validación va como middleware `validate(schema)` en la ruta; el controller lee `req.validated`).
- Contrato de respuesta único: `{ success: true, data }` / `{ success: false, error: { message, code } }` vía `utils/response.js`; errores de negocio con `throw new AppError(msg, status, code)`.
- Todo listado usa `getPagination`/`buildPaginatedResponse` (`?page&limit`, tope 100).
- `process.env` solo se lee en `config/env.js` (schema Joi; en producción el proceso muere si falta algo crítico). Variable nueva ⇒ sumarla al schema y a `.env.example`.
- **Aislamiento por dueño**: no hay organizaciones; el tenant es el usuario. Toda query sobre macetas (o recursos colgados de ellas: readings, events, alerts) debe filtrar con `potScope(req)` de `middlewares/auth.js` (admin ve todo, técnico/visualizador solo `ownerId` propio). Los deletes son soft (`isActive: false`).
- Roles: `admin` (todo), `tecnico` (CRUD de sus macetas + riego manual), `visualizador` (solo lectura — nunca debe poder mutar ni regar).

### Convenciones frontend

- `services/api.js` es el único lugar que conoce rutas del backend; expone una función por endpoint que hace `unwrap()` → lanza `ApiError` con `code`. Las páginas nunca usan Axios directo.
- Estado global solo en `stores/auth.js` (sesión en `localStorage` como `gda_session`, refresh automático en 401 vía interceptor). El estado de página vive en el componente.
- Páginas CRUD usan `composables/useCrudResource.js` + `components/LoadingState.vue`; entidad nueva = función en `api.js` → página → ruta lazy en `router/index.js` (guard central con `meta.public`/`meta.roles`) → ítem de nav en `DashboardLayout.vue`.
- Tiempo real: `composables/useRealtimeStream.js` abre SSE con token efímero (~60s, se renueva solo al reconectar). Eventos: `reading`, `event`, `alert`, `alert_resolved`, `pot_status`.
- Prefijo CSS propio `gda-`; clases compartidas del layout en `styles/dashboard-unified.css` (importada globalmente en `main.js`, junto a `app.css` que define los design tokens `--gda-*` y las fuentes).
- Identidad visual: tokens en `:root` de `app.css` (paleta suelo/agua: `--gda-leaf`, `--gda-water`, `--gda-clay`, `--gda-pine`…), tipografías Bricolage Grotesque (display) / Albert Sans (UI) / IBM Plex Mono (toda la telemetría). El componente firma es `MoistureBand.vue` (banda de umbrales min–max con marcador por zona). Chart.js no lee variables CSS: los hex de `HistoryChart.vue` deben mantenerse sincronizados con los tokens.
- Gotcha Quasar: los colores de marca salen de `quasar-variables.sass`, que solo aplica si `main.js` importa `quasar/src/css/index.sass` (NO `quasar/dist/quasar.css`, que es precompilado) y `vite.config.js` pasa `sassVariables` como ruta absoluta (`fileURLToPath`).

### Puntos con estado implícito

- El estado `online` de una maceta se enciende con cualquier mensaje del nodo (telemetría o heartbeat) y se apaga solo por el job de timeout de sensores (`SENSOR_TIMEOUT_MIN`, default 15 min sin reportar ⇒ alerta `fallo_sensor` + offline). No hay evento de desconexión: el broker está en la nube y el backend no ve los connects/disconnects del nodo. La alerta se auto-resuelve cuando vuelve la telemetría.
- Las alertas deduplican por (maceta, tipo, estado activa) en `alertService.raiseAlert`; varias se auto-resuelven desde `decisionService` cuando la condición desaparece.
- El pronóstico (Open-Meteo, sin API key) se cachea en Mongo por ubicación redondeada a 2 decimales con TTL de 3h; `decisionService` solo lee caché, nunca la API.

## Despliegue

Cloudflare Pages (frontend, `_redirects` ya incluido) + Railway (backend; MQTT necesita un TCP Proxy al puerto 1883 — ver sección 6 del instructivo ESP32) + MongoDB Atlas. Las variables `VITE_*` se inyectan en build time: cambiarlas exige redeploy manual del frontend.
