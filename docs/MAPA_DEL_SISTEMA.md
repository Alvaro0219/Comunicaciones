# Mapa del sistema — cómo se conecta todo (hardware, broker, backend, frontend)

> Documento de referencia técnica: recorre **cada pieza real** del sistema (archivo por archivo, función por función) y cómo se conectan entre sí. Para guías de uso día a día ver [GUIA_HARDWARE_FIRMWARE.md](GUIA_HARDWARE_FIRMWARE.md) (equipo) y [ESP32_CONNECTION_GUIDE.md](ESP32_CONNECTION_GUIDE.md) (contrato de mensajes). Las credenciales reales están en el documento interno "GDA Guia Setup" — acá no se repiten.

---

## 1. Panorama general

```
┌──────────────┐   WiFi + TLS    ┌────────────────┐   TLS (cliente)   ┌───────────────────┐
│  ESP32 nodo1  │ ─────────────► │  HiveMQ Cloud  │ ◄──────────────── │  Backend Node.js   │
│  (hardware)   │ ◄───────────── │ (broker MQTT)  │ ─────────────────►│  (este repo)        │
└──────────────┘   subscribe     └────────────────┘     publish       └─────────┬──────────┘
                                                                                  │
                                                              HTTP (REST) + SSE  │  Mongoose
                                                                                  ▼
                                                                        ┌──────────────────┐
                                                                        │  MongoDB Atlas    │
                                                                        └──────────────────┘
                                                                                  ▲
                                                                                  │
                                                                        ┌──────────────────┐
                                                                        │  Frontend (Vue)   │
                                                                        │  navegador        │
                                                                        └──────────────────┘
```

Cinco piezas, cinco "idiomas" distintos de conexión:

| # | Tramo | Protocolo | Quién inicia la conexión |
|---|---|---|---|
| 1 | ESP32 ⇄ HiveMQ | MQTT sobre TLS (puerto 8883) | El ESP32 (y el backend) se conectan *al* broker |
| 2 | Backend ⇄ HiveMQ | MQTT sobre TLS (puerto 8883) | El backend, como cliente |
| 3 | Backend ⇄ MongoDB | Mongoose (driver de MongoDB) | El backend |
| 4 | Frontend ⇄ Backend (comandos) | HTTP/REST (`/api/...`) | El navegador |
| 5 | Frontend ⇄ Backend (tiempo real) | SSE (Server-Sent Events, `/api/stream`) | El navegador |

Ninguna de estas conexiones pasa por las otras piezas — no hay, por ejemplo, una conexión directa entre el ESP32 y el frontend. Todo pasa por el backend, que es el único que le habla a las cinco piezas.

---

## 2. Tramo 1 y 2 — El broker MQTT (HiveMQ Cloud)

### Qué es y por qué existe

Un broker MQTT es un intermediario de mensajes: nadie le "pide" datos a nadie directamente, todos publican y se suscriben a **topics** (canales con nombre). El broker reparte cada mensaje publicado a todos los suscriptos a ese topic exacto. Ventaja concreta para este proyecto: el ESP32 (en la red de Tomás) y el backend (en la red de cada integrante) nunca necesitan verse entre sí ni compartir red — ambos hablan solo con HiveMQ, que está en internet.

### Los tres topics del contrato

Con `{PREFIX}` = `gda/prod` (nodo real) o `gda/dev-tunombre` (desarrollo):

| Topic | Quién publica | Quién se suscribe | Contenido |
|---|---|---|---|
| `{PREFIX}/{nodeId}/telemetria` | ESP32 | Backend | Lecturas + diagnóstico |
| `{PREFIX}/{nodeId}/comando` | Backend | ESP32 | Orden de riego |
| `{PREFIX}/{nodeId}/evento` | ESP32 | Backend | Confirmación de riego |

### Del lado del ESP32 — [`firmware/gda-nodo/gda-nodo.ino`](../firmware/gda-nodo/gda-nodo.ino)

Lo que hace este archivo, en orden de ejecución:

1. **`setup()`** (línea 124): conecta WiFi (`conectarWiFi()`, con `WiFiMulti` probando 3 redes precargadas desde `secrets.h`), arranca OTA y Telnet, y arma los tres nombres de topic con `snprintf` (líneas 151-153) usando `PREFIX` y `NODO_ID` (constantes en las líneas 24 y 26).
2. **`net.setCACert(CA_CERT)`** (línea 155): carga el certificado de la autoridad certificadora (Let's Encrypt) para que la conexión TLS a HiveMQ sea válida. Sin esto, la conexión falla con `rc=-2`.
3. **`reconectarMQTT()`** (línea 106): hace `mqtt.connect(cid, MQTT_USER, MQTT_PASS)` — este es el login: usuario y contraseña son la credencial de HiveMQ del nodo (`gda_nodo1`, en `secrets.h`, nunca en este `.ino`). Si conecta, hace `mqtt.subscribe(topic_comando)` — a partir de acá, cualquier mensaje que el backend publique en `.../comando` dispara `onMessage()` (línea 100).
4. **`loop()`** (línea 162): cada 5 segundos arma un JSON a mano (líneas 190-194: `maceta_id`, `rssi`, `ssid`, `ip`, `heap`) y lo publica en `topic_telemetria` con `mqtt.publish()`. **Este es el estado actual**: el JSON todavía no incluye `humedad` — Tomás está por sumarlo cuando conecte el sensor de humedad de suelo.

### Del lado del backend — [`backend/src/mqtt/client.js`](../backend/src/mqtt/client.js)

Este archivo es el espejo del `.ino` del lado servidor:

1. **`startMqtt({ onTelemetry, onEvent })`** (línea 26): llama a `mqttLib.connect()` con `mqtts://${MQTT_HOST}:${MQTT_PORT}` y las credenciales que vienen de `config/env.js` (ver sección 4). Nótese que recibe los handlers **por parámetro** en vez de importar los services directamente — esto evita un ciclo de imports, porque `irrigationService.js` necesita importar *este mismo archivo* para publicar comandos.
2. Al conectar (evento `'connect'`, línea 42), se suscribe a **dos** wildcards: `{prefix}/+/telemetria` y `{prefix}/+/evento` — el `+` es un comodín MQTT que matchea cualquier `nodeId`, así el backend escucha todos los nodos del prefijo con una sola suscripción.
3. En cada mensaje (evento `'message'`, línea 52): parsea el topic para extraer `nodeId` y `channel` (línea 54: `topic.slice(prefix.length + 1).split('/')`), parsea el JSON del payload, y llama a `onTelemetry(nodeId, payload)` o `onEvent(nodeId, payload)` según el canal.
4. **`publishCommand(nodeId, payload)`** (línea 78): la única función que *escribe* al broker. Antes de publicar, chequea `env.mqtt.writeMode` — si es `false` (modo lectura), solo loguea y no publica nada. Esta es la guardia de equipo contra activar la bomba por accidente.

### Quién conecta estas dos partes: `app.js`

En [`backend/src/app.js`](../backend/src/app.js) (línea 74), `startServer()` llama:
```js
startMqtt({ onTelemetry: handleTelemetry, onEvent: handleAck });
```
`handleTelemetry` está en `services/ingestService.js` y `handleAck` en `services/irrigationService.js` — son los que efectivamente *hacen algo* con cada mensaje (ver sección 3). `startMqtt` es solo el cartero; no sabe nada de umbrales de riego ni de Mongo.

---

## 3. Qué hace el backend con cada mensaje que llega

### 3.1 Telemetría → [`services/ingestService.js`](../backend/src/services/ingestService.js)

`handleTelemetry(nodeId, raw)` (línea 43) es la función que se ejecuta por cada mensaje en `.../telemetria`. Paso a paso:

1. **Busca la maceta** por `nodeId` (línea 44: `Pot.findOne({ nodeId, isActive: true })`). Si no existe, descarta el mensaje con un warning — por eso hace falta crear la maceta con el Node ID exacto *antes* de que el nodo empiece a publicar.
2. **`normalizeTelemetry(raw)`** (línea 15): traduce el contrato en español del nodo real (`humedad`, `temp_ambiente`, `hum_ambiente`) a los nombres internos (`soil`, `temp`, `air`), y también acepta el contrato legado en inglés (`soilMoisture`, etc. — usado por el simulador viejo) vía el operador `??`. También separa el diagnóstico (`rssi`/`ssid`/`ip`/`heap`) en su propio objeto.
3. **Bifurcación clave** (línea 60): si `t.soil` es `null` (el mensaje no traía `humedad` — el caso de hoy, mientras el sensor no está conectado), el backend **solo actualiza el diagnóstico y el estado online** de la maceta (línea 61) y corta ahí. No crea ningún `Reading`, no corre el motor de decisión.
4. **Si trae `humedad`**: valida rangos físicos con `rangeErrors()` (línea 35: 0-100% para humedades, -40..80°C para temperatura), y crea un documento `Reading` (línea 75). Si la humedad viene fuera de 0-100 (por ejemplo, un valor crudo de ADC sin calibrar), el documento se guarda con `status: 'invalida'` — se ve en el historial, pero no dispara riego.
5. **Deduplicación** (línea 86-88): el modelo `Reading` tiene un índice único en `{nodeId, measuredAt}` ([`models/Reading.js`](../backend/src/models/Reading.js), línea 20). Si el mismo nodo reenvía la misma medición (retransmisión offline), Mongo rechaza el insert con código `11000` y el handler simplemente retorna sin error.
6. **Difunde por SSE** (línea 105: `broadcast('reading', {...}, pot.ownerId)`) — así el dashboard se actualiza sin que nadie recargue la página (ver sección 5).
7. **Dispara el motor de decisión** (línea 119-120), pero solo si la lectura es válida **y** reciente (menos de 10 minutos desde `measuredAt` — para que una retransmisión vieja no dispare un riego "hoy" con datos de hace horas).

### 3.2 El motor de decisión → [`services/decisionService.js`](../backend/src/services/decisionService.js)

`evaluateReading(pot, reading)` (línea 14) es el corazón funcional del sistema. Recibe la maceta (con sus umbrales) y la lectura recién normalizada, y aplica, en orden:

1. **Humedad bajo el mínimo** (línea 24: `soil < pot.minMoisture`): consulta `weatherService.rainExpected()` para ver si hay lluvia prevista en las próximas 6 horas por encima de `pot.rainProbThreshold`.
   - Si hay lluvia prevista → crea un `Event` tipo `riego_pospuesto` y una alerta `preventiva`. **No riega.**
   - Si no hay lluvia → llama a `triggerIrrigation()` (sección 3.3) y levanta una alerta `critica`.
2. **Humedad sobre el máximo** (línea 52): crea un `Event` tipo `riego_no_aplicado` y una alerta `exceso_humedad`. Nunca riega en este caso.
3. **Humedad en rango**: resuelve (cierra) cualquier alerta de humedad que estuviera activa (línea 67).
4. **Regla de calor** (línea 73, independiente de las anteriores): si `temp` no es `null` y supera `pot.heatTempThreshold` con humedad relativamente baja, dispara un riego breve adicional (`origin: 'calor'`) y una alerta `calor_extremo`. Como hoy el nodo no manda temperatura, esta regla simplemente no se evalúa (`temp != null` es `false`) — no rompe nada, solo queda inactiva hasta que el AM2302 esté conectado.

**Invariante importante**: toda rama de esta función crea un `Event`, incluso cuando la decisión es "no regar". No existe un camino donde el sistema decida algo sobre el riego sin dejarlo registrado.

### 3.3 Ejecutar el riego → [`services/irrigationService.js`](../backend/src/services/irrigationService.js)

`triggerIrrigation({ pot, durationSec, origin, ... })` (línea 19) es el único lugar del código que puede iniciar un riego — lo usan tanto el motor automático (sección 3.2) como el botón "Regar ahora" del dashboard (`origin: 'manual'`).

1. **Primera pregunta: ¿estamos en modo escritura?** (línea 23: `if (!isWriteMode())`). Si `MODO_ESCRITURA=false` (el default en desarrollo), crea igual el `Event` — con el mensaje `[modo lectura] riego omitido: MODO_ESCRITURA=false` — y **corta ahí**, sin tocar el broker. Esto es lo que vas a ver mientras desarrollás con el simulador: la decisión queda 100% registrada y visible, pero nunca sale una orden real.
2. **Si estamos en modo escritura**: chequea que no haya ya un riego `enviada` para esa maceta (evita solapar órdenes), crea el `Event` (`result: 'pendiente'`) y un documento `IrrigationCommand` con un `uuid` propio.
3. **Publica el comando** (línea 66): `publishCommand(pot.nodeId, { activar_riego: true, duracion_seg: durationSec, commandId: uuid })` — esto es lo que el firmware del ESP32 recibiría en `.../comando` si estuviera suscripto y procesando comandos (hoy el `.ino` de referencia solo loguea el mensaje recibido, `onMessage()` línea 100 — accionar el relé es lo próximo que falta en el firmware).
4. Marca la maceta como `watering.active = true` y difunde por SSE.

**La confirmación** — `handleAck(nodeId, payload)` (línea 86) — es la función que corre cuando llega un mensaje a `.../evento`. El contrato real del nodo es `{"maceta_id":1,"evento":"riego_exitoso"}` (sin `commandId`): como no hay forma de saber a qué comando exacto corresponde, el backend confirma **el comando `enviada` más reciente de ese nodo** (línea 98: `.sort({ sentAt: -1 })`). Si en el futuro el firmware manda `commandId`, el matching es exacto (línea 97).

Si nunca llega confirmación, `expireStaleCommands()` (línea 132, llamado cada minuto desde `jobs/scheduler.js` línea 31) marca la orden como `expirada` pasado `COMMAND_TIMEOUT_SEC` (default 60s).

---

## 4. Configuración: el archivo que decide todo el comportamiento

[`backend/src/config/env.js`](../backend/src/config/env.js) es el **único** lugar donde se lee `process.env` en todo el backend — ninguna otra parte del código accede a variables de entorno directamente. Lee `backend/.env` (nunca commiteado) y valida todo contra un schema Joi.

Las variables que importan para esta conexión (sección MQTT, líneas 16-25):

| Variable | Para qué | Dónde se usa |
|---|---|---|
| `MQTT_HOST` / `MQTT_PORT` | Dirección de HiveMQ | `mqtt/client.js` línea 33, arma la URL `mqtts://` |
| `MQTT_USER` / `MQTT_PASS` | Tu credencial personal en HiveMQ | `mqtt/client.js` línea 36-37 |
| `MQTT_CLIENT_ID` | Identificador único de tu conexión | `mqtt/client.js` línea 38 — si dos personas usan el mismo, HiveMQ las desconecta en loop mutuamente |
| `TOPIC_PREFIX` | A qué "canal" te suscribís | `mqtt/client.js` línea 44-45 y `publishCommand` línea 87 |
| `MODO_ESCRITURA` | Si tu backend puede publicar comandos | `irrigationService.js` línea 23, vía `isWriteMode()` |

Cambiar cualquiera de estas 5 variables y reiniciar (`npm run dev`) es la única forma de cambiar a qué te conectás — no hay que tocar código para apuntar a `gda/prod` en vez de tu prefijo de desarrollo, por ejemplo.

---

## 5. Tramo 4 y 5 — Del backend al navegador

Hasta acá, todo lo que pasó quedó guardado en MongoDB (vía Mongoose) y "gritado" por SSE (`broadcast(...)`). Falta la otra punta: cómo el navegador se entera.

### El modelo de datos en MongoDB

Cuatro colecciones se tocan en el flujo de telemetría/riego:

- **`Pot`** ([`models/Pot.js`](../backend/src/models/Pot.js)): el documento "vivo" de cada maceta — `lastReading`, `diagnostics`, `watering`, `lastIrrigation` son snapshots que se sobreescriben en cada mensaje, para que el dashboard tenga un solo `GET` que traer al cargar la página.
- **`Reading`** ([`models/Reading.js`](../backend/src/models/Reading.js)): serie temporal completa, una fila por lectura, con el índice único de deduplicación ya mencionado.
- **`Event`**: el historial de decisiones de riego (activado, pospuesto, no aplicado, omitido por modo lectura).
- **`IrrigationCommand`**: el registro de cada orden publicada, con su `uuid` y estado (`enviada`/`confirmada`/`fallida`/`expirada`).

### Server-Sent Events — cómo el navegador se entera "en vivo"

1. El frontend pide un token efímero: `POST /api/stream/token` → [`controllers/streamController.js`](../backend/src/controllers/streamController.js) línea 9, firma un JWT de ~60 segundos con `purpose: 'sse'` (necesario porque `EventSource` del navegador no puede mandar headers `Authorization`, así que el token viaja por query string).
2. El frontend abre `new EventSource(".../api/stream?token=...")` — eso entra a `openStream()` (línea 18) → `addClient(req, res)` en [`realtime/sseHub.js`](../backend/src/realtime/sseHub.js) línea 8, que deja la conexión HTTP abierta indefinidamente y la guarda en un `Map` en memoria.
3. Cada vez que `ingestService`, `decisionService` o `irrigationService` llaman a `broadcast(type, payload, ownerId)` (sseHub.js línea 25), el hub recorre ese `Map` y escribe el mensaje a cada cliente conectado cuyo `ownerId` coincida (o que sea admin) — esto es lo que hace que **dos pestañas del dashboard, o dos usuarios distintos, vean exactamente los eventos que les corresponden** y no los de macetas ajenas.
4. Del lado del frontend, [`composables/useRealtimeStream.js`](../frontend/src/composables/useRealtimeStream.js) (línea 6) envuelve todo esto: pide el token, abre el `EventSource`, y registra un listener por cada tipo de evento (`reading`, `event`, `alert`, `pot_status`) que le pasen las páginas. Como el token dura ~60s, `onerror` (línea 31) cierra la conexión vieja y `scheduleReconnect()` (línea 42) pide un token nuevo a los 3 segundos — por eso la reconexión es transparente para quien mira el dashboard.

### El otro camino: HTTP normal para todo lo que no es "tiempo real"

Crear una maceta, pedir el historial paginado, loguearse, forzar un riego manual — todo eso son llamados REST normales desde `frontend/src/services/api.js` contra `backend/src/routes/*.js` → `controllers/*.js`. No tiene nada especial relacionado al hardware; es el mismo patrón CRUD del resto de la skill de arquitectura. El único cruce con esta guía es `POST /api/pots/:id/irrigate` ([`potController.js`](../backend/src/controllers/potController.js)), que termina llamando al mismo `triggerIrrigation()` de la sección 3.3.

---

## 6. El simulador — mismo código, distinto emisor

[`simulator/index.js`](../simulator/index.js) no es parte de "cómo se conecta todo": es un reemplazo temporal del Tramo 1. Se conecta a HiveMQ con una credencial que tenga permiso de *publish* (`gda_sim_tunombre`) y publica exactamente el mismo JSON que publicaría el `.ino` (incluida la humedad, cosa que el nodo real todavía no manda) al mismo topic `{PREFIX}/{nodeId}/telemetria`. Desde el punto de vista del backend, un mensaje del simulador y un mensaje del ESP32 real son indistinguibles — por eso sirve para probar los tramos 2 a 5 completos sin depender del hardware.

---

## 7. Resumen de un ciclo completo, de punta a punta

1. El ESP32 mide humedad → arma JSON → `mqtt.publish()` a `gda/prod/nodo1/telemetria` (broker HiveMQ).
2. HiveMQ reenvía ese mensaje a todo suscriptor de `gda/prod/+/telemetria` — entre ellos, el backend desplegado (`mqtt/client.js`).
3. `client.js` extrae `nodeId="nodo1"`, canal `"telemetria"` → llama `handleTelemetry("nodo1", payload)` (`ingestService.js`).
4. `ingestService` guarda un `Reading`, actualiza el `Pot`, difunde `reading` por SSE, y llama `evaluateReading()` (`decisionService.js`).
5. `decisionService` compara contra los umbrales de esa maceta + el pronóstico cacheado → decide regar → llama `triggerIrrigation()` (`irrigationService.js`).
6. `irrigationService` chequea `MODO_ESCRITURA` → si es `true`, crea `Event` + `IrrigationCommand` → `publishCommand()` (`mqtt/client.js`) → HiveMQ → `gda/prod/nodo1/comando`.
7. El ESP32, suscripto a ese topic, recibe el comando en `onMessage()` → (pendiente en el firmware) acciona el relé → publica en `.../evento`.
8. El backend recibe ese evento → `handleAck()` confirma el `IrrigationCommand` y el `Event` → difunde por SSE.
9. El navegador, con el `EventSource` abierto, recibe el evento `event` y `pot_status` → Vue actualiza la UI sin recargar.

Cada número de esta lista es una función mencionada en las secciones 2 a 5 — si algo del ciclo no funciona, este mapa dice exactamente en qué archivo y función mirar.
