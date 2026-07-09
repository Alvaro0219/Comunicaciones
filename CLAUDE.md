# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

```bash
# Backend (API + broker MQTT) — requiere MONGO_URL real en backend/.env
cd backend && npm run dev                 # node --watch, puerto 4000 (API) y 1883 (MQTT)
npm run seed:admin -- <email> <pass> "Nombre"   # crea/promueve el usuario admin

# Frontend (dashboard)
cd frontend && npm run dev                # Vite, puerto 5173
npm run build                             # build de producción (verificación rápida de errores)

# Simulador de nodos ESP32 (reemplaza el hardware real en desarrollo)
cd simulator && node index.js --node <nodeId>:<deviceToken> --interval 15 [--offline-chance 0.1]
```

No hay tests ni linter configurados. La verificación estándar es: `npm run build` en frontend, y arrancar el backend (si todos los módulos cargan, el único error aceptable sin Atlas configurado es el de conexión Mongo). Las credenciales `nodeId:deviceToken` del simulador salen de crear una maceta en el dashboard.

## Arquitectura

Monorepo de cuatro piezas: `backend/` (Node ESM + Express + Mongoose), `frontend/` (Vue 3 `<script setup>` + Quasar + Pinia + Vite), `simulator/` (cliente MQTT que imita al firmware) y `firmware/gda_node/` (sketch Arduino real para ESP32-WROOM-32 + FC-28 + AM2302 + relé; el usuario solo edita `config.h`). `docs/ESP32_CONNECTION_GUIDE.md` es el contrato público con el hardware y `docs/GUIA_HARDWARE_FIRMWARE.md` la guía práctica de cableado/carga — si se cambia el protocolo MQTT o el formato de mensajes, hay que actualizar contrato, firmware y simulador juntos.

### Flujo central (el "ciclo de riego")

Es el camino que cruza casi todos los archivos del backend:

1. El nodo publica telemetría en `gda/{nodeId}/telemetry` → `mqtt/broker.js` (Aedes embebido, autentica contra `Pot.deviceToken`) la rutea a `services/ingestService.js`.
2. `ingestService` valida rangos físicos (fuera de rango ⇒ se guarda con `status: 'invalida'`, no se descarta), deduplica por índice único `{nodeId, measuredAt}` (así las retransmisiones offline con `source: 'replay'` no duplican), actualiza el snapshot `lastReading` de la maceta y difunde por SSE.
3. Si la lectura es válida y reciente (<10 min), corre `services/decisionService.js`: el motor de reglas (umbrales de la maceta + pronóstico cacheado de `weatherService`). **Toda decisión —incluida la de no regar— crea un `Event`**; ese es un invariante del dominio.
4. Si decide regar, `services/irrigationService.js` crea un `IrrigationCommand` (uuid), publica en `gda/{nodeId}/command` y deja el `Event` en `pendiente`. El ack del nodo en `gda/{nodeId}/ack` lo confirma o falla; sin ack en `COMMAND_TIMEOUT_SEC`, el job de `jobs/scheduler.js` lo expira. El riego manual (`POST /pots/:id/irrigate`) entra por este mismo circuito con `origin: 'manual'`.
5. Cada paso emite eventos SSE vía `realtime/sseHub.js`; el hub filtra por dueño (admin recibe todo, el resto solo sus macetas).

Para evitar ciclos de imports, `mqtt/broker.js` no importa services: recibe los handlers (`onTelemetry`, `onAck`, `onNodeStatus`) por parámetro desde `app.js`. `irrigationService` sí importa `publishCommand` del broker.

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

- El estado `online` de una maceta lo mantienen dos fuentes: los eventos connect/disconnect del broker y el job de timeout de sensores (15 min sin reportar ⇒ alerta `fallo_sensor` + offline). La alerta se auto-resuelve cuando vuelve la telemetría.
- Las alertas deduplican por (maceta, tipo, estado activa) en `alertService.raiseAlert`; varias se auto-resuelven desde `decisionService` cuando la condición desaparece.
- El pronóstico (Open-Meteo, sin API key) se cachea en Mongo por ubicación redondeada a 2 decimales con TTL de 3h; `decisionService` solo lee caché, nunca la API.

## Despliegue

Cloudflare Pages (frontend, `_redirects` ya incluido) + Railway (backend; MQTT necesita un TCP Proxy al puerto 1883 — ver sección 6 del instructivo ESP32) + MongoDB Atlas. Las variables `VITE_*` se inyectan en build time: cambiarlas exige redeploy manual del frontend.
