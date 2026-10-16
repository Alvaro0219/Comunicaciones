# Mapa del sistema — cómo se conecta todo (hardware, broker, backend, frontend)

> Documento de referencia técnica: recorre **cada pieza real** del sistema (archivo por archivo, función por función) y cómo se conectan entre sí. Se referencia por **nombre de función** y no por número de línea, para que no envejezca con cada edición. Para guías de uso día a día ver [GUIA_HARDWARE_FIRMWARE.md](GUIA_HARDWARE_FIRMWARE.md) (equipo) y [ESP32_CONNECTION_GUIDE.md](ESP32_CONNECTION_GUIDE.md) (contrato de mensajes). La documentación del nodo físico (cableado, calibración) está en [GDA_Documentacion_Nodo1.md](GDA_Documentacion_Nodo1.md). Las credenciales reales están en el documento interno "GDA Guia Setup" — acá no se repiten.

---

## 1. Panorama general

```
┌──────────────┐   WiFi + TLS    ┌────────────────┐   TLS (cliente)   ┌───────────────────┐
│  ESP32 nodo1 │ ─────────────►  │ HiveMQ Cloud   │ ◄──────────────── │  Backend Node.js  │
│  (hardware)  │ ◄─────────────  │ (broker MQTT)  │ ─────────────────►│  (este repo)      │
└──────────────┘   subscribe     └────────────────┘     publish       └─────────┬─────────┘
                                                                                │
                                                              HTTP (REST) + SSE │  Mongoose
                                                                                ▼
                                                                        ┌──────────────────┐
                                                                        │  MongoDB Atlas   │
                                                                        └──────────────────┘
                                                                                  ▲
                                                                                  │
                                                                        ┌──────────────────┐
                                                                        │  Frontend (Vue)  │
                                                                        │  navegador       │
                                                                        └──────────────────┘
```

Cinco tramos, cinco "idiomas" distintos de conexión:

| # | Tramo | Protocolo | Quién inicia la conexión |
|---|---|---|---|
| 1 | ESP32 ⇄ HiveMQ | MQTT sobre TLS (puerto 8883) | El ESP32 (y el backend) se conectan *al* broker |
| 2 | Backend ⇄ HiveMQ | MQTT sobre TLS (puerto 8883) | El backend, como cliente |
| 3 | Backend ⇄ MongoDB | Mongoose (driver de MongoDB) | El backend |
| 4 | Frontend ⇄ Backend (comandos) | HTTP/REST (`/api/...`) | El navegador |
| 5 | Frontend ⇄ Backend (tiempo real) | SSE (Server-Sent Events, `/api/stream`) | El navegador |

Ninguna de estas conexiones pasa por las otras piezas — no hay, por ejemplo, una conexión directa entre el ESP32 y el frontend. Todo pasa por el backend, que es el único que le habla a las cinco piezas.

### La decisión de diseño que atraviesa todo: el nodo mide y ejecuta, el backend decide

```
ESP32 mide ─► telemetría ─► broker ─► backend decide ─► orden ─► broker ─► ESP32 ejecuta ─► evento ─► backend confirma
                                      (umbrales + pronóstico,
                                       o el botón "Regar ahora")
```

El firmware **no tiene reglas de riego**: publica la humedad y obedece órdenes (`activar_riego` durante `duracion_seg`). El backend compara cada lectura con los umbrales de la maceta y el pronóstico, y manda la orden; también la puede mandar el botón "Regar ahora". Se controla con `CONTROL_RIEGO` (`backend` por defecto). El valor `nodo` existe solo como compatibilidad con el sketch de **prueba** del firmware (que riega solo con una regla local de 50–55 % y no procesa comandos); no se usa con el firmware del diseño. Detalle en [ESP32_CONNECTION_GUIDE.md](ESP32_CONNECTION_GUIDE.md), sección 4.

---

## 2. Tramo 1 y 2 — El broker MQTT (HiveMQ Cloud)

### Qué es y por qué existe

Un broker MQTT es un intermediario de mensajes: nadie le "pide" datos a nadie directamente, todos publican y se suscriben a **topics** (canales con nombre). El broker reparte cada mensaje publicado a todos los suscriptos a ese topic exacto. Ventaja concreta para este proyecto: el ESP32 (en la red de Tomás) y el backend (en la red de cada integrante) nunca necesitan verse entre sí ni compartir red — ambos hablan solo con HiveMQ, que está en internet.

### Los tres topics del contrato

Con `{PREFIX}` = `gda/prod` (nodo real) o `gda/dev-tunombre` (desarrollo):

| Topic | Quién publica | Quién se suscribe | Contenido |
|---|---|---|---|
| `{PREFIX}/{nodeId}/telemetria` | ESP32 | Backend | `{maceta_id, humedad, bomba, rssi, ssid, ip, heap}` cada 30 s |
| `{PREFIX}/{nodeId}/comando` | Backend | ESP32 | `{activar_riego, duracion_seg, commandId}` |
| `{PREFIX}/{nodeId}/evento` | ESP32 | Backend | `{maceta_id, bomba, humedad, motivo, duracion_seg, commandId}` en cada cambio de la bomba |

### Del lado del ESP32 — [`firmware/gda-nodo-v2/gda-nodo-v2.ino`](../firmware/gda-nodo-v2/gda-nodo-v2.ino)

Qué hace este archivo, por función:

1. **`setup()`**: fija el relé apagado *antes* de configurarlo como salida (para que no haya un pulso al arrancar), configura el ADC, conecta WiFi con `WiFiMulti` (3 redes desde `secrets.h`), arranca OTA (cuyo `onStart` apaga el relé) y Telnet, arma los nombres de topic con `snprintf` a partir de `PREFIX` y `NODO_ID`, y carga el certificado raíz con `net.setCACert(CA_CERT)` (sin él la conexión TLS a HiveMQ falla con `rc=-2`).
2. **`publicarTelemetria()`** (desde `loop()`, la primera apenas conecta y luego cada `TELEMETRIA_MS`): llama a `leerHumedadSuelo()` — promedio de 10 muestras del FC-28 en GPIO 34, convertido a 0–100 % con `SUELO_SECO`/`SUELO_MOJADO` (rango invertido: más crudo = más seco) — y publica el JSON con `humedad`, `temp_ambiente` y `hum_ambiente` (si el AM2302 respondió), `bomba` (estado del relé), `rssi`, `ssid`, `ip` y `heap`. El AM2302 lo lee **`servicioAmbiente()`** (cada `AMBIENTE_MS`, 5 s, en segundo plano desde `loop()` y sin depender de la red) con la librería DHTesp en GPIO 15: descarta valores imposibles, conserva la última lectura buena y, si pasan `AMBIENTE_VIGENCIA_MS` (2 min) sin una buena, `ambienteVigente()` da falso y esos dos campos se omiten del JSON.
3. **`reconectarMQTT()`**: un intento cada 5 s, sin bloquear. `mqtt.connect(cid, MQTT_USER, MQTT_PASS)` es el login (credencial `gda_nodo1`, en `secrets.h`, nunca en el `.ino`) con **sesión limpia**: una orden publicada mientras el nodo estaba desconectado no se le entrega al volver. Si conecta, `mqtt.subscribe(topic_comando, 1)`.
4. **`onMessage()`**: callback de `.../comando`. Parsea el JSON con ArduinoJson y llama a `iniciarRiego(duracion_seg, commandId)`, o a `detenerRiego("orden de detencion")` si llega `activar_riego:false` (parada de emergencia).
5. **`iniciarRiego()`**: acota la duración a `DURACION_MAX_S` (120 s), ignora la orden si ya hay un riego en curso, mide la humedad, enciende el relé con `escribirRele(true)`, guarda `tBombaFin = millis() + duración` y publica el evento `bomba:true` (con el `commandId`).
6. **`servicioBomba()`**, **la primera línea de cada vuelta del `loop()` y sin depender de la red**: si venció `tBombaFin`, llama a `detenerRiego("fin de riego")`, que **apaga el relé primero**, mide la humedad y publica el evento `bomba:false` con la `duracion_seg` real y el `commandId`. El apagado lo decide el tiempo medido en el propio nodo: si se cae el WiFi o el broker durante el riego, la bomba igual se apaga. Si no hay MQTT en ese momento, `publicarEvento()` deja el evento en `eventoPendiente` y `loop()` lo reenvía al reconectar.

### Del lado del backend — [`backend/src/mqtt/client.js`](../backend/src/mqtt/client.js)

Este archivo es el espejo del `.ino` del lado servidor:

1. **`startMqtt({ onTelemetry, onEvent })`**: llama a `mqttLib.connect()` con `mqtts://${MQTT_HOST}:${MQTT_PORT}` y las credenciales de `config/env.js` (sección 4). Recibe los handlers **por parámetro** en vez de importar los services — evita un ciclo de imports, porque `irrigationService.js` importa *este mismo archivo* para publicar comandos.
2. Al conectar se suscribe a dos comodines: `{prefix}/+/telemetria` y `{prefix}/+/evento`. El `+` matchea cualquier `nodeId`, así una sola suscripción escucha todos los nodos del prefijo.
3. En cada mensaje extrae `nodeId` y canal del topic (`topic.slice(prefix.length + 1).split('/')`), parsea el JSON y lo mete en una cola con **`enqueue(nodeId, ...)`**. La cola procesa los mensajes **de un mismo nodo en orden y de a uno**: el evento de bomba y la telemetría pueden llegar casi juntos y ambos tocan el estado de riego; en paralelo podrían registrar el mismo riego dos veces.
4. **`publishCommand(nodeId, payload)`**: la única función que *escribe* al broker. Si `MODO_ESCRITURA` es `false` solo loguea y no publica. Es la guardia de equipo contra activar la bomba por accidente. Además, publicar exige que la credencial tenga permiso de **Publish** en HiveMQ: las cuentas personales (*Subscribe only*) no pueden.

### Quién conecta estas dos partes: `app.js`

En [`backend/src/app.js`](../backend/src/app.js), `startServer()` llama:

```js
startMqtt({ onTelemetry: handleTelemetry, onEvent: handleNodeEvent });
```

`handleTelemetry` está en `services/ingestService.js` y `handleNodeEvent` en `services/irrigationService.js`: son los que *hacen algo* con cada mensaje (sección 3). `startMqtt` es solo el cartero; no sabe nada de umbrales ni de Mongo.

---

## 3. Qué hace el backend con cada mensaje que llega

### 3.1 Telemetría → [`services/ingestService.js`](../backend/src/services/ingestService.js)

`handleTelemetry(nodeId, raw)` se ejecuta por cada mensaje en `.../telemetria`:

1. **Busca la maceta** por `nodeId` (`Pot.findOne({ nodeId, isActive: true })`). Si no existe, descarta el mensaje con un warning: hay que crear la maceta con el Node ID exacto (`nodo1`) *antes* de que el nodo publique.
2. **`normalizeTelemetry(raw)`** traduce el contrato del nodo (`humedad`, `temp_ambiente`, `hum_ambiente`, `bomba`) a los nombres internos (`soil`, `temp`, `air`, `pump`), y acepta también el contrato anterior en inglés (`soilMoisture`…, del simulador) con el operador `??`. Separa el diagnóstico (`rssi`/`ssid`/`ip`/`heap`).
3. **Bifurcación**: si no hay `humedad` es un *heartbeat* de diagnóstico: se actualiza `online`/`diagnostics` de la maceta y se corta ahí (sin `Reading`, sin motor). Con `humedad` sigue el flujo de lectura.
4. **Validación y guardado**: `validateReading()` chequea los rangos físicos. Solo la humedad de **suelo** fuera de 0–100 invalida la lectura entera (`status: 'invalida'`: se ve en el historial pero no dispara nada; un valor crudo sin calibrar cae acá). Una temperatura (−40..80 °C) o una humedad del aire (0–100 %) imposibles **no** invalidan: se descartan solo esos campos (quedan `null`, con el motivo en `invalidReason`), porque el AM2302 a veces entrega basura y no debe frenar el riego. `normalizeTelemetry` también trata como "sin dato" lo que no sea un número finito.
5. **Deduplicación**: `Reading` tiene un índice único `{nodeId, measuredAt}`; un reenvío de la misma medición hace fallar el insert con código `11000` y el handler retorna sin error. Como el firmware no manda timestamp, `measuredAt` es la hora de recepción (ver recomendaciones en el contrato).
6. **Estado de la bomba**: si el mensaje trae `bomba`, llama a `irrigationService.applyPumpState()` con `via:'telemetria'` (sección 3.3). Sirve para mostrar "Regando…" y corregir el estado si se perdió un evento (el firmware publica sin QoS), pero **nunca confirma una orden**: solo lo hace el evento explícito del nodo.
7. **Difunde por SSE** (`broadcast('reading', …)`) para que el dashboard se actualice sin recargar (sección 5).
8. **Corre el motor de decisión**, solo si la lectura es válida **y** reciente (menos de 10 min), para que una retransmisión vieja no dispare nada "hoy".

### 3.2 El motor de decisión → [`services/decisionService.js`](../backend/src/services/decisionService.js)

`evaluateReading(pot, reading)` aplica las reglas de negocio con los umbrales de la maceta. Con `CONTROL_RIEGO=backend` (el diseño):

| Condición | Qué hace |
|---|---|
| Humedad **bajo el mínimo** | Consulta el pronóstico (`weatherService.rainExpected`, 6 h). **Con lluvia prevista**: evento `riego_pospuesto` + alerta `preventiva`. **Sin lluvia**: si ya pasó la espera desde el último riego, `triggerIrrigation()` + alerta `critica`; si no, solo la alerta `critica` con el aviso "esperando que haga efecto el riego reciente" |
| Humedad **sobre el máximo** | Evento `riego_no_aplicado` + alerta `exceso_humedad` |
| Humedad **en rango** | Resuelve las alertas de humedad abiertas |
| **Calor** (si hay temperatura) | Alerta `calor_extremo` + riego breve (`triggerIrrigation`, `origin:'calor'`), con la misma espera |

**La espera entre riegos** (`DECISION_COOLDOWN_MIN`, 10 min; helper `recentEvent`): el nodo manda telemetría cada pocos segundos pero el suelo tarda minutos en reflejar el agua. Sin la espera, con la humedad todavía baja se volvería a regar en la lectura siguiente. Cuenta cualquier riego reciente (automático, manual o fallido) y también evita registrar un evento "pospuesto" o "no aplicado" en cada lectura. El riego manual no la respeta.

La alerta `critica` nunca dice "riego activado" si no se emitió una orden: el texto sale del resultado de `triggerIrrigation` (`riego omitido (modo lectura)`, `riego en curso`, `esperando que haga efecto el riego reciente`).

**Invariante**: toda decisión de riego queda registrada como `Event`, incluso la de "no regar" (una vez por ventana de espera, no una por lectura). La regla de calor usa la temperatura que publica el AM2302; si el sensor no responde (`temp` es `null`) la regla simplemente no se evalúa y el riego por humedad de suelo sigue funcionando.

*Con `CONTROL_RIEGO=nodo` (compatibilidad con el sketch de prueba)* el motor solo levanta y resuelve alertas: sin órdenes ni eventos de decisión, porque ese nodo riega por su cuenta.

### 3.3 El riego → [`services/irrigationService.js`](../backend/src/services/irrigationService.js)

**Orden del backend — `triggerIrrigation` / `applyPumpState` / `finishCommand`**

`triggerIrrigation({ pot, durationSec, origin, … })` es el único lugar que puede emitir una orden (lo usan el motor y el botón "Regar ahora", `origin:'manual'`). Sus guardas, en orden:

1. **`nodo_autonomo`**: solo con `CONTROL_RIEGO=nodo`; retorna sin hacer nada (ese nodo no procesa comandos). El controller lo traduce en `409 NODE_NO_COMMANDS`.
2. **Modo lectura**: con `MODO_ESCRITURA=false` crea el `Event` ("`[modo lectura]` riego omitido") y corta antes de tocar el broker.
3. **Riego en curso**: si ya hay una orden `enviada` para esa maceta, no solapa otra.
4. Crea el `Event` (`pendiente`) y un `IrrigationCommand` con `uuid`, publica `{activar_riego, duracion_seg, commandId}` con `publishCommand()` y marca la maceta como regando.

**La confirmación** llega por `handleNodeEvent`, que corre por cada mensaje en `.../evento`. Si trae `bomba` busca la maceta y llama a **`applyPumpState(pot, {on, humedad, motivo, commandId, executedDurationSec, via})`**:

- **Hay una orden pendiente**: el `bomba:false` del **evento** la confirma vía `finishCommand()` (orden `confirmada`, evento `confirmado`, `watering` apagado, `lastIrrigation` con la **duración real** que reportó el nodo). Con `commandId` se matchea esa orden exacta; un evento de un `commandId` que no está pendiente se ignora. Si el motivo es `corte por tiempo maximo`, la orden queda `fallida`.
- **Solo el evento confirma**, no la telemetría: el `bomba:false` de la telemetría puede ser anterior a que el nodo reciba la orden (o el nodo puede estar ignorándola), y darla por cumplida mostraría un riego exitoso que nunca ocurrió.
- **El contrato anterior** — `handleAck`: `{"evento":"riego_exitoso"}` o `{"ok":true}` también confirman.

**Bomba encendida sin orden del backend** (p. ej. el sketch de prueba): `applyPumpState` lo registra como un `Event` `riego_activado` con `source:'nodo'` y lo cierra al apagarse (`fallido` si fue un corte de seguridad), para que la actividad de la bomba nunca pase inadvertida. Es idempotente: el mismo estado por evento y por telemetría no duplica nada.

**Si nunca llega confirmación**, `expireStaleCommands()` (cada minuto, desde `jobs/scheduler.js`) marca la orden `expirada` pasados `duracion + COMMAND_TIMEOUT_SEC` (60 s de margen): el plazo incluye la duración para no dar por perdida una orden de 90 s mientras la bomba todavía riega.

---

## 4. Configuración: el archivo que decide todo el comportamiento

[`backend/src/config/env.js`](../backend/src/config/env.js) es el **único** lugar donde se lee `process.env`; ninguna otra parte del código accede a variables de entorno directamente. Lee `backend/.env` (nunca commiteado) y valida todo contra un schema Joi.

Las variables que importan para esta conexión:

| Variable | Para qué | Dónde se usa |
|---|---|---|
| `MQTT_HOST` / `MQTT_PORT` | Dirección de HiveMQ | `mqtt/client.js`, arma la URL `mqtts://` |
| `MQTT_USER` / `MQTT_PASS` | Tu credencial en HiveMQ (para ordenar riego necesita **Publish**) | `mqtt/client.js` |
| `MQTT_CLIENT_ID` | Identificador único de tu conexión | `mqtt/client.js` — si dos personas usan el mismo, HiveMQ las desconecta en loop |
| `TOPIC_PREFIX` | A qué "canal" te suscribís; tiene que ser el mismo `PREFIX` del nodo | `mqtt/client.js` (suscripciones y `publishCommand`) |
| `MODO_ESCRITURA` | Si tu backend puede publicar órdenes | `isWriteMode()`, usado en `irrigationService.triggerIrrigation` |
| `CONTROL_RIEGO` | `backend` (default: el backend decide) o `nodo` (solo compatibilidad con el sketch de prueba) | `decisionService.evaluateReading` y `irrigationService.triggerIrrigation` |
| `DECISION_COOLDOWN_MIN` | Espera entre riegos automáticos y entre decisiones repetidas (10 min) | `decisionService` (`recentEvent`) |
| `COMMAND_TIMEOUT_SEC` | Margen para que el nodo confirme, además de la duración del riego (60 s) | `irrigationService.expireStaleCommands` |

Cambiar cualquiera de estas variables y reiniciar (`npm run dev`) es la única forma de cambiar a qué te conectás o cómo decide: no hay que tocar código para apuntar a `gda/prod` en vez de tu prefijo de desarrollo.

---

## 5. Tramo 4 y 5 — Del backend al navegador

Hasta acá, todo lo que pasó quedó guardado en MongoDB (vía Mongoose) y "gritado" por SSE (`broadcast(...)`). Falta la otra punta: cómo el navegador se entera.

### El modelo de datos en MongoDB

Cuatro colecciones se tocan en el flujo de telemetría/riego:

- **`Pot`** ([`models/Pot.js`](../backend/src/models/Pot.js)): el documento "vivo" de cada maceta, con sus umbrales y su configuración de riego. `lastReading`, `diagnostics`, `watering` y `lastIrrigation` son snapshots que se sobreescriben en cada mensaje, para que el dashboard resuelva el estado actual con un solo `GET`.
- **`Reading`** ([`models/Reading.js`](../backend/src/models/Reading.js)): serie temporal completa, una fila por lectura, con el índice único de deduplicación. `temperature` y `airHumidity` pueden ser `null`.
- **`Event`** ([`models/Event.js`](../backend/src/models/Event.js)): historial de riegos y decisiones. El campo **`source`** distingue `backend` (orden del motor o riego manual) de `nodo` (bomba encendida sin orden, detectada por su evento o su telemetría).
- **`IrrigationCommand`**: registro de cada orden publicada, con su `uuid` y estado (`enviada`/`confirmada`/`fallida`/`expirada`).

### Server-Sent Events — cómo el navegador se entera "en vivo"

1. El frontend pide un token efímero: `POST /api/stream/token` → `issueStreamToken` ([`controllers/streamController.js`](../backend/src/controllers/streamController.js)) firma un JWT de ~60 s con `purpose: 'sse'`. Hace falta porque `EventSource` no puede mandar headers `Authorization`; el token viaja por query string.
2. El frontend abre `new EventSource(".../api/stream?token=...")`: entra a `openStream()` → `addClient(req, res)` en [`realtime/sseHub.js`](../backend/src/realtime/sseHub.js), que deja la conexión HTTP abierta y la guarda en un `Map` en memoria.
3. Cada vez que `ingestService`, `decisionService` o `irrigationService` llaman a `broadcast(type, payload, ownerId)`, el hub recorre ese `Map` y escribe el mensaje a cada cliente conectado cuyo `ownerId` coincida (o que sea admin): dos usuarios distintos ven solo los eventos de sus propias macetas.
4. Del lado del frontend, [`composables/useRealtimeStream.js`](../frontend/src/composables/useRealtimeStream.js) envuelve todo: pide el token, abre el `EventSource` y registra un listener por tipo de evento (`reading`, `event`, `alert`, `pot_status`). Como el token dura ~60 s, `onerror` cierra la conexión y `scheduleReconnect()` pide uno nuevo a los 3 s, así la reconexión es transparente.

### El gráfico de 24 horas

`GET /api/pots/:id/readings/recent` ([`readingController.recentReadings`](../backend/src/controllers/readingController.js)) **no devuelve lecturas crudas**: agrupa con `$group`/`$dateTrunc` en intervalos de `ceil(horas*60/300)` minutos (5 min para 24 h) y promedia, devolviendo unos 300 puntos sin importar la cadencia de la telemetría. Un simple `.limit()` mostraría las lecturas más viejas de la ventana. Las series sin datos (temperatura y aire, hoy) no se dibujan.

### El otro camino: HTTP normal para todo lo que no es "tiempo real"

Crear una maceta (con sus umbrales), pedir el historial paginado, loguearse, forzar un riego manual: son llamados REST desde `frontend/src/services/api.js` contra `backend/src/routes/*.js` → `controllers/*.js`. El cruce con el hardware es `POST /api/pots/:id/irrigate` ([`potController.js`](../backend/src/controllers/potController.js)), que llama a `triggerIrrigation({origin:'manual'})` y recorre el mismo circuito de orden → ejecución → confirmación que el riego automático.

---

## 6. El simulador

[`simulator/index.js`](../simulator/index.js) **ya no es necesario para el flujo normal**: hay un nodo real publicando. Sigue sirviendo para probar el ciclo de órdenes sin hardware con tu prefijo de desarrollo. Usa el contrato anterior (`temp_ambiente`, `hum_ambiente`, confirma con `riego_exitoso`), que el backend sigue aceptando. Ver la sección 4 de [GUIA_HARDWARE_FIRMWARE.md](GUIA_HARDWARE_FIRMWARE.md).

---

## 7. Resumen de un ciclo completo, de punta a punta

**Riego automático**

1. El ESP32 llama a `publicarTelemetria()`: mide el FC-28 y publica `{humedad, bomba:false, rssi, …}` en `gda/prod/nodo1/telemetria`.
2. HiveMQ la reenvía a todo suscriptor de `gda/prod/+/telemetria`, entre ellos `mqtt/client.js`, que la encola para ese nodo → `handleTelemetry("nodo1", payload)`.
3. `ingestService` guarda un `Reading`, actualiza `Pot.lastReading`, difunde `reading` por SSE y llama `evaluateReading()`.
4. `evaluateReading`: la humedad está bajo el mínimo de la maceta, no hay lluvia prevista y pasó la espera desde el último riego → `triggerIrrigation()`.
5. `triggerIrrigation` crea un `Event` `pendiente` y un `IrrigationCommand`, y `publishCommand()` publica `{activar_riego:true, duracion_seg:5, commandId}` en `gda/prod/nodo1/comando` (solo con `MODO_ESCRITURA=true` y una credencial con Publish). La maceta pasa a "Regando…" por SSE.
6. El ESP32, suscripto a ese topic, recibe la orden en `onMessage()` → `iniciarRiego()`: enciende el relé, fija `tBombaFin` y publica el evento `{bomba:true, motivo:"orden de riego", commandId}`.
7. A los 5 s `servicioBomba()` ve que venció el tiempo → `detenerRiego()`: apaga el relé y publica `{bomba:false, motivo:"fin de riego", duracion_seg:5, commandId}` en `gda/prod/nodo1/evento`.
8. El backend: `handleNodeEvent` → `applyPumpState` → `finishCommand`: la orden queda `confirmada`, el evento `confirmado`, "Último riego" se actualiza con la duración real, y se difunden `event` + `pot_status`.
9. El navegador, con el `EventSource` abierto, recibe `reading`, `event`, `alert` y `pot_status` y Vue actualiza la UI sin recargar.

**Riego manual**: el usuario toca "Regar ahora" → `POST /api/pots/:id/irrigate` → `triggerIrrigation({origin:'manual'})` y sigue desde el paso 5 (sin la espera entre riegos).

Cada paso de esta lista es una función de las secciones 2 a 5: si algo del ciclo no funciona, este mapa dice en qué archivo mirar.
