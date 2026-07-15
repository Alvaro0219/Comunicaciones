# Contrato de comunicación — Nodo ESP32 ⇄ Broker en la nube ⇄ Backend GDA

> **Referencia técnica del protocolo.** La guía práctica (MQTT Explorer, `.env` del backend, simulador, reglas del equipo) está en [GUIA_HARDWARE_FIRMWARE.md](GUIA_HARDWARE_FIRMWARE.md). Las credenciales reales viven en el documento interno del equipo ("GDA Guia Setup") y **nunca** en este repo.

## 1. Arquitectura

El sistema usa un **broker MQTT en la nube (HiveMQ Cloud)** como punto fijo. Ni el nodo ni el backend necesitan compartir red: cada uno se conecta al broker desde donde esté, con TLS obligatorio.

```
   ESP32 (nodo1)                HiveMQ Cloud                Backend Node.js
   +-----------+   publish     +--------------+  subscribe  +----------------+
   | AM2302    |   TLS:8883    |              | ----------> | Normaliza      |
   | Suelo     | ------------> |  Broker MQTT |             | Evalúa umbral  |
   | Relé      |               |              | <---------- | Guarda en DB   |
   +-----------+ <------------ |              |   publish   | Publica orden  |
        ^          subscribe   +--------------+             +----------------+
        |                                                          |
        +-- OTA / Telnet (solo misma LAN)                          v
                                                              MongoDB Atlas
```

- **Conexión**: `mqtts://` (TLS), puerto **8883** (o 8884 para WebSocket+TLS).
- **Autenticación**: usuarios/contraseñas definidos en HiveMQ, con permisos por rol: el nodo y el backend desplegado tienen *Publish+Subscribe*; las cuentas personales de desarrollo son *Subscribe only* (no pueden activar la bomba ni por accidente).
- **El backend es un cliente más** del broker (librería `mqtt`), no un servidor.

## 2. Topics

`{PREFIX}` es `gda/prod` para el nodo real y el backend desplegado. En desarrollo, **cada persona usa su propio prefijo** (`gda/dev-nombre`) para no pisarse ni interferir con producción.

| Topic | Dirección | Contenido |
|---|---|---|
| `{PREFIX}/{nodeId}/telemetria` | Nodo → Broker | Lecturas de sensores + diagnóstico |
| `{PREFIX}/{nodeId}/comando` | Backend → Nodo | Orden de riego |
| `{PREFIX}/{nodeId}/evento` | Nodo → Broker | Confirmación de riego ejecutado |

El `{nodeId}` (ej. `nodo1`) debe coincidir con el campo **Node ID** de la maceta registrada en el dashboard: es la clave con la que el backend asocia cada mensaje a su maceta.

## 3. Formato de los mensajes

### 3.1 Telemetría (`.../telemetria`)

El firmware publica siempre el diagnóstico; los campos de sensores se suman cuando el sensor está conectado:

```json
{
  "maceta_id": 1,
  "humedad": 42.5,
  "temp_ambiente": 24.3,
  "hum_ambiente": 61.0,
  "rssi": -66,
  "ssid": "TP-Link_Extender",
  "ip": "192.168.0.56",
  "heap": 172432
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `humedad` | número 0–100 | Humedad de suelo (%). **Si falta, el mensaje es solo diagnóstico**: el backend actualiza estado online/IP/RSSI pero no registra lectura ni decide riego |
| `temp_ambiente` | número | °C. Opcional (AM2302 pendiente de conexión) |
| `hum_ambiente` | número 0–100 | Humedad del aire (%). Opcional |
| `rssi` / `ssid` / `ip` / `heap` | — | Diagnóstico del nodo. La `ip` es la que se usa para OTA/Telnet |
| `measuredAt` | epoch (s), opcional | Si falta, el backend usa la hora de recepción. Reservado para retransmisión offline (RNF4, pendiente) junto con `source: "replay"` |

Validación en el backend: valores fuera de rango físico (humedad 0–100, temperatura −40..80) se guardan marcados `invalida` y no disparan riego. Telemetría de un `nodeId` sin maceta registrada se descarta con log.

### 3.2 Orden de riego (`.../comando`)

```json
{ "activar_riego": true, "duracion_seg": 5, "commandId": "uuid-...(opcional)" }
```

El backend agrega `commandId` para correlacionar la confirmación; el firmware puede ignorarlo.

### 3.3 Confirmación (`.../evento`)

```json
{ "maceta_id": 1, "evento": "riego_exitoso" }
```

Si el mensaje trae `commandId`, el backend confirma esa orden exacta; si no, confirma la orden pendiente más reciente de ese nodo. Sin confirmación dentro de `COMMAND_TIMEOUT_SEC` (default 60s), la orden se marca **expirada** y el evento de riego queda `fallido`.

## 4. Protecciones contra riegos accidentales (dos capas)

1. **Permisos del broker**: las cuentas personales son *Subscribe only* — HiveMQ rechaza cualquier `publish` a `.../comando` aunque el código lo intente.
2. **`MODO_ESCRITURA` en el backend**: con `false` (obligatorio en local), el motor evalúa y **registra** la decisión (evento `[modo lectura] riego omitido`), pero no publica la orden. Solo el backend desplegado corre con `true`.

## 5. Despliegue

El backend desplegado (Railway/Fly.io) solo necesita salida a internet — **ya no hace falta TCP proxy ni puerto MQTT propio**, porque el broker vive en HiveMQ. Variables: `MQTT_HOST/PORT/USER/PASS` con la credencial `gda_backend` (Publish+Subscribe), `MQTT_CLIENT_ID` único, `TOPIC_PREFIX=gda/prod`, `MODO_ESCRITURA=true`.

## 6. Límites del plan gratuito

| Servicio | Límite | ¿Alcanza? |
|---|---|---|
| HiveMQ Cloud | 100 conexiones, 10 GB/mes | Sí — el nodo usa ~4 MB/mes |
| MongoDB Atlas | 512 MB | Sí |
