# GDA — Gemelo Digital Agrícola

Sistema de riego automatizado para macetas: nodos sensores ESP32 + backend con motor de decisión de riego + dashboard web en tiempo real.

## Arquitectura

```
ESP32 (nodo1: sensores + bomba)          HiveMQ Cloud (broker MQTT, TLS 8883)
   └────────── publish/subscribe ──────────┐   ▲
                                           ▼   │ cliente MQTT
backend/   Node.js + Express + MongoDB (Atlas)─┘
   │         · Motor de decisión de riego (umbrales + pronóstico Open-Meteo)
   │         · Alertas (email opcional) · Eventos · SSE en tiempo real
   │         · MODO_ESCRITURA: en local evalúa pero no publica comandos
   ▼
frontend/  Vue 3 + Quasar + Pinia (dashboard en vivo, CRUD, historial)

simulator/ Simulador del nodo (mismo contrato MQTT contra HiveMQ)
firmware/  Copia de referencia del firmware real (gda-nodo.ino + secrets.h.example)
docs/      Contrato MQTT y guía práctica del equipo
```

El broker vive en la nube: ni el nodo ni el backend comparten red. Las credenciales MQTT están en el documento interno del equipo ("GDA Guia Setup") y **no se commitean**.

## Puesta en marcha (desarrollo)

### 1. Base de datos
Crear un cluster gratuito (M0) en [MongoDB Atlas](https://mongodb.com/atlas), un usuario con `readWrite`, permitir acceso de red, y pegar el connection string en `backend/.env` → `MONGO_URL` (agregando `/gda` como nombre de base).

### 2. Backend
```bash
cd backend
npm install
# completar backend/.env: MONGO_URL + sección MQTT (credenciales del documento del equipo)
npm run seed:admin -- admin@gda.local UnaPasswordSegura "Admin GDA"
npm run dev
```
API en `http://localhost:4000` (health: `/health`). En el log debe aparecer `Conectado a HiveMQ (...)`. Reglas: `MQTT_CLIENT_ID` único por persona, `TOPIC_PREFIX` propio (`gda/dev-tunombre`) y `MODO_ESCRITURA=false` en local.

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```
Dashboard en `http://localhost:5173`. Login con el admin creado, o registrarse (rol técnico por defecto).

### 4. Simular el nodo (sin hardware)
1. En el dashboard: Macetas → **Nueva maceta** con Node ID `nodo1` (más umbrales y ubicación lat/lon para el pronóstico).
2. Correr el simulador con una credencial que tenga permiso de publish (`gda_sim_tunombre`, ver documento del equipo):
```bash
cd simulator
npm install
node index.js --host <HIVEMQ_HOST> --user gda_sim_tunombre --pass <PASS> --prefix gda/dev-tunombre
```
Mismo `TOPIC_PREFIX` que el backend. Flags: `--node nodo1` (default), `--interval 5` (segundos).

### 5. El nodo real y el equipo
- **[docs/GUIA_HARDWARE_FIRMWARE.md](docs/GUIA_HARDWARE_FIRMWARE.md)** — guía práctica del equipo: MQTT Explorer, `.env` del backend, simulador, reglas (prefijos, client IDs, `MODO_ESCRITURA`), estado del nodo y diagnóstico.
- [docs/ESP32_CONNECTION_GUIDE.md](docs/ESP32_CONNECTION_GUIDE.md) — contrato MQTT de referencia (topics, payloads, protecciones).
- [firmware/gda-nodo/](firmware/gda-nodo/) — copia de referencia del firmware real (lo mantiene quien tiene el hardware; `secrets.h` nunca se commitea).

## Funcionalidad

- **Macetas (CRUD)** con umbrales de humedad, duración de riego, umbral de calor y ubicación; cada maceta se asocia a un nodo por su Node ID (la auth MQTT vive en HiveMQ).
- **Telemetría** validada (rangos físicos), histórica, con diagnóstico del nodo (RSSI, IP para OTA, heap) y soporte de retransmisión offline sin duplicados (idempotencia por nodo+timestamp, listo para el RNF4 del firmware).
- **Motor de riego**: humedad < mínimo → riega, salvo lluvia prevista en 6h (pospone, alerta preventiva); humedad > máximo → inhibe riego (alerta exceso); calor extremo + humedad baja → riego breve. Toda decisión queda registrada como evento.
- **Pronóstico** Open-Meteo cacheado 3h, visible a 5 días en el dashboard.
- **Riego manual** desde el dashboard con el mismo circuito orden→ack.
- **Alertas** (crítica, preventiva, calor extremo, fallo de sensor, exceso de humedad) con preferencias de notificación por usuario y email opcional (SMTP en `.env`).
- **Dashboard en tiempo real** (SSE): estado actual, riego en curso, gráfico 24h, pronóstico, alertas — sin recargar.
- **Historial** de lecturas/eventos/alertas con filtro por fechas y trazabilidad de origen (auto/manual).
- **Roles**: administrador (todo), técnico (sus macetas + riego manual), visualizador (solo lectura). Cada usuario solo ve sus macetas.
- **Tolerancia a fallos**: nodos offline detectados y visibles; sin ack de riego en 60s → orden expirada y evento fallido.

## Variables de entorno

Ver `backend/.env.example` (Mongo, JWT, MQTT, umbrales por defecto, SMTP) y `frontend/.env` (`VITE_API_BASE`).

## Despliegue

Cloudflare Pages (frontend, `_redirects` ya incluido) + Railway/Fly.io (backend — solo necesita salida a internet: el broker vive en HiveMQ, sin puertos MQTT propios) + MongoDB Atlas. El backend desplegado usa la credencial `gda_backend`, `TOPIC_PREFIX=gda/prod` y `MODO_ESCRITURA=true` (es el único que publica comandos).
