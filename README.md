# GDA — Gemelo Digital Agrícola

Sistema de riego automatizado para macetas: nodos sensores ESP32 + backend con motor de decisión de riego + dashboard web en tiempo real.

## Arquitectura

```
ESP32 (sensores + bomba)
   │  MQTT (broker Aedes embebido, puerto 1883)
   ▼
backend/   Node.js + Express + MongoDB (Atlas)
   │         · Motor de decisión de riego (umbrales + pronóstico Open-Meteo)
   │         · Alertas (email opcional) · Eventos · SSE en tiempo real
   ▼
frontend/  Vue 3 + Quasar + Pinia (dashboard en vivo, CRUD, historial)

simulator/ Simulador de nodos ESP32 (mismo contrato MQTT, para probar sin hardware)
firmware/  Firmware Arduino del nodo real (ESP32 + FC-28 + AM2302 + relé)
docs/      Guías de conexión del hardware físico
```

## Puesta en marcha (desarrollo)

### 1. Base de datos
Crear un cluster gratuito (M0) en [MongoDB Atlas](https://mongodb.com/atlas), un usuario con `readWrite`, permitir acceso de red, y pegar el connection string en `backend/.env` → `MONGO_URL` (agregando `/gda` como nombre de base).

### 2. Backend
```bash
cd backend
npm install
npm run seed:admin -- admin@gda.local UnaPasswordSegura "Admin GDA"
npm run dev
```
API en `http://localhost:4000` (health: `/health`) y broker MQTT en puerto `1883`.

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```
Dashboard en `http://localhost:5173`. Login con el admin creado, o registrarse (rol técnico por defecto).

### 4. Simular nodos ESP32 (sin hardware)
1. En el dashboard: Macetas → **Nueva maceta** (definir `nodeId`, umbrales y ubicación lat/lon para el pronóstico). Copiar el **device token** del diálogo de credenciales.
2. Correr el simulador:
```bash
cd simulator
npm install
node index.js --node maceta-01:EL_DEVICE_TOKEN --interval 15
```
Flags útiles: `--interval <seg>` (ciclo acelerado; el real es 10 min), `--offline-chance 0.1` (simula cortes de conectividad con retransmisión), varios `--node` para múltiples macetas.

### 5. Conectar el ESP32 real
- **[docs/GUIA_HARDWARE_FIRMWARE.md](docs/GUIA_HARDWARE_FIRMWARE.md)** — guía práctica paso a paso: cableado (FC-28, AM2302, relé), Arduino IDE, calibración y puesta en marcha. El firmware listo para cargar está en [firmware/gda_node/](firmware/gda_node/) (solo se edita `config.h`).
- [docs/ESP32_CONNECTION_GUIDE.md](docs/ESP32_CONNECTION_GUIDE.md) — contrato MQTT de referencia (formato exacto de mensajes, topics, despliegue con Railway).

## Funcionalidad

- **Macetas (CRUD)** con umbrales de humedad, duración de riego, umbral de calor y ubicación; cada maceta = un nodo ESP32 con credenciales MQTT propias.
- **Telemetría** validada (rangos físicos), histórica, con marca `live`/`replay` (retransmisión offline sin duplicados — idempotencia por nodo+timestamp).
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

Cloudflare Pages (frontend) + Railway (backend, con TCP proxy para MQTT — ver sección 6 del instructivo ESP32) + MongoDB Atlas. Guía completa en la skill de despliegue del proyecto.
