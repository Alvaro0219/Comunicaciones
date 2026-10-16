# Contrato de comunicación — Nodo ESP32 ⇄ Broker en la nube ⇄ Backend GDA

> **Referencia técnica del protocolo.** La guía práctica (MQTT Explorer, `.env` del backend, simulador, reglas del equipo) está en [GUIA_HARDWARE_FIRMWARE.md](GUIA_HARDWARE_FIRMWARE.md). Para ver qué archivo y función procesa cada mensaje, ver [MAPA_DEL_SISTEMA.md](MAPA_DEL_SISTEMA.md). Las credenciales reales viven en el documento interno del equipo ("GDA Guia Setup") y **nunca** en este repo.

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
- **Autenticación**: usuarios/contraseñas definidos en HiveMQ, con permisos por rol: el nodo y el backend desplegado tienen _Publish+Subscribe_; las cuentas personales de desarrollo son _Subscribe only_ (no pueden activar la bomba ni por accidente).
- **El backend es un cliente más** del broker (librería `mqtt`), no un servidor.

## 2. Topics

`{PREFIX}` es `gda/prod` para el nodo real y el backend desplegado. En desarrollo, **cada persona usa su propio prefijo** (`gda/dev-nombre`) para no pisarse ni interferir con producción.

| Topic                          | Dirección      | Contenido                          |
| ------------------------------ | -------------- | ---------------------------------- |
| `{PREFIX}/{nodeId}/telemetria` | Nodo → Broker  | Lecturas de sensores + diagnóstico |
| `{PREFIX}/{nodeId}/comando`    | Backend → Nodo | Orden de riego                     |
| `{PREFIX}/{nodeId}/evento`     | Nodo → Broker  | Cambio de estado de la bomba (encendida/apagada + motivo) |

El `{nodeId}` (ej. `nodo1`) debe coincidir con el campo **Node ID** de la maceta registrada en el dashboard: es la clave con la que el backend asocia cada mensaje a su maceta.

## 3. Formato de los mensajes

### 3.1 Telemetría (`.../telemetria`)

Formato que publica el firmware (`gda-nodo-v2.ino`) cada `TELEMETRIA_MS` (30 s; el sketch de prueba anterior, cada 5 s):

```json
{
  "maceta_id": 1,
  "humedad": 42,
  "temp_ambiente": 24.3,
  "hum_ambiente": 61.5,
  "bomba": true,
  "rssi": -66,
  "ssid": "TP-Link_Extender",
  "ip": "192.168.0.56",
  "heap": 172432
}
```

| Campo                           | Tipo                | Notas                                                                                                                                                   |
| ------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `humedad`                       | número 0–100        | Humedad de suelo (%), entero ya calibrado en el nodo (FC-28). Fuera de 0–100 el backend la guarda como `invalida`. **Si el campo falta, el mensaje es solo diagnóstico**: se actualiza online/IP/RSSI pero no se registra lectura |
| `temp_ambiente`                 | número              | °C del aire (AM2302). **Opcional**: el firmware lo omite si el sensor falla o pasan 2 min sin una lectura buena; el backend lo toma como `null` y el dashboard oculta la métrica                                                                                                             |
| `hum_ambiente`                  | número 0–100        | Humedad del aire (%), también del AM2302. Opcional, igual que la temperatura                                                                                                                          |
| `rssi` / `ssid` / `ip` / `heap` | —                   | Diagnóstico del nodo. La `ip` es la que se usa para OTA/Telnet                                                                                          |
| `measuredAt`                    | epoch (s), opcional | Si falta, el backend usa la hora de recepción. Reservado para retransmisión offline (RNF4, pendiente) junto con `source: "replay"`                      |

Validación en el backend: la humedad de **suelo** fuera de 0–100 invalida toda la lectura (se guarda `invalida` y no dispara riego). La temperatura (fuera de −40..80) o la humedad del aire (fuera de 0–100) **no** invalidan la lectura: se descartan solo esos campos (quedan `null` y se anota el motivo), porque el AM2302 de vez en cuando entrega basura y un dato ambiental malo no debe frenar el riego. La temperatura alimenta la regla de **calor extremo** (temperatura ≥ umbral de la maceta, 35 °C por defecto, con el suelo a menos de mínimo + 10 %): alerta y riego breve. Telemetría de un `nodeId` sin maceta registrada se descarta con log.

`bomba` (boolean) es el estado actual del relé. Es **informativa**: permite mostrar "Regando…" y corregir el estado si se perdió un evento (el firmware publica sin QoS), pero **nunca confirma una orden** (ver 3.3). Es idempotente: el mismo estado por telemetría y por evento no duplica nada.

### 3.2 Orden de riego (`.../comando`)

```json
{ "activar_riego": true, "duracion_seg": 5, "commandId": "uuid-..." }
```

- **`activar_riego: true` + `duracion_seg`**: el nodo enciende la bomba y **él mismo** la apaga cuando vence el tiempo, medido en el nodo con `millis()`. Así, si se cae el WiFi o el broker a mitad del riego, la bomba igual se apaga.
- **`commandId`** identifica la orden; el nodo lo devuelve en sus eventos.
- **`{"activar_riego": false}`** es una parada de emergencia: apaga la bomba de inmediato (el backend todavía no la emite).
- El nodo acota la duración a un **tope duro** (`DURACION_MAX_S`, 120 s en `gda-nodo-v2.ino`) aunque la orden pida más, e ignora una orden mientras ya hay un riego en curso.
- El nodo usa **sesión MQTT limpia**: una orden publicada mientras estaba desconectado *no* se le entrega al volver. Regar tarde por una orden vieja es peor que no regar.

### 3.3 Evento de bomba (`.../evento`)

El nodo publica un evento **cada vez que cambia el estado de la bomba**:

```json
{ "maceta_id": 1, "bomba": false, "humedad": 52, "motivo": "fin de riego", "duracion_seg": 5, "commandId": "uuid-..." }
```

| Campo | Notas |
|---|---|
| `bomba` | `true` = acaba de encender, `false` = acaba de apagar |
| `humedad` | Medición fresca en ese momento (se omite si no hubo ninguna) |
| `motivo` | Texto: `orden de riego` (encendió), `fin de riego` (venció el tiempo), `orden de detencion` (parada de emergencia) |
| `duracion_seg` | Solo al apagar: segundos que estuvo **realmente** encendida (puede ser menos que lo pedido si el nodo acotó la duración) |
| `commandId` | El de la orden en curso |

Cómo lo interpreta el backend (`irrigationService.applyPumpState`):

- **Hay una orden pendiente**: el evento de apagado es su **confirmación** — orden `confirmada`, evento `confirmado` y "Último riego" con la duración real. Con `commandId` se matchea esa orden exacta, y un evento con un `commandId` que no es de ninguna orden pendiente se ignora. El `bomba:true` no hace nada (la orden ya está registrada).
- **Solo el evento confirma.** El `bomba:false` de la *telemetría* nunca da por cumplida una orden: puede ser anterior a que el nodo la reciba, o el nodo puede estar ignorándola. Mostraría un riego exitoso que nunca ocurrió.
- **Sin orden pendiente** (bomba encendida por otro motivo, p. ej. el sketch de prueba): se registra como un riego `source:"nodo"` para que no pase inadvertido. Si el motivo es `corte por tiempo maximo` queda `fallido`.
- **Contrato anterior** (simulador): `{"evento":"riego_exitoso"}` o `{"ok":true}` siguen confirmando la orden pendiente.
- **Sin confirmación** dentro de `duracion_seg + COMMAND_TIMEOUT_SEC` (60 s de margen) la orden queda **expirada** y el evento `fallido`. El plazo incluye la duración para no dar por perdida una orden de 90 s a los 60 s mientras la bomba todavía riega.

## 4. Quién decide el riego

**El nodo mide y ejecuta; el backend decide.** Es el diseño del sistema (`CONTROL_RIEGO=backend`, el default). El firmware **no tiene reglas de riego propias**:

```
ESP32 mide ─► telemetría ─► broker ─► backend decide ─► orden ─► broker ─► ESP32 ejecuta ─► evento ─► backend confirma
                                      (umbrales + pronóstico,
                                       o el botón "Regar ahora")
```

| Situación | Qué hace el backend |
|---|---|
| Humedad **bajo el mínimo** de la maceta, sin lluvia prevista (6 h) | Ordena regar `irrigationDurationSec` + alerta crítica |
| Humedad bajo el mínimo, **con lluvia prevista** | Pospone (evento `riego_pospuesto`) + alerta preventiva |
| Humedad **sobre el máximo** | No riega (evento `riego_no_aplicado`) + alerta de exceso de humedad |
| **Calor extremo** + humedad baja (requiere temperatura) | Riego breve + alerta |
| Botón **"Regar ahora"** | Ordena regar ya, ignorando la espera entre riegos |

Los umbrales, la duración y la ubicación (para el pronóstico) se configuran **por maceta en el dashboard**, no en el firmware.

### Espera entre riegos (`DECISION_COOLDOWN_MIN`, 10 min)

El suelo tarda minutos en reflejar el agua. Si el backend decidiera en cada lectura, con la humedad todavía baja volvería a regar en la lectura siguiente (cada 30 s) y encharcaría la maceta. Por eso, después de **cualquier** riego (automático, manual o fallido) no se emite otro automático hasta que pasen 10 minutos; mientras tanto la alerta crítica sigue visible con el aviso "esperando que haga efecto el riego reciente". La misma espera evita registrar un evento "pospuesto" o "no aplicado" en cada lectura. El riego manual no la respeta: es una decisión explícita del usuario. Coincide con el ciclo de diseño (una decisión cada 10 minutos por nodo).

### Capas de seguridad

1. **Nodo**: relé apagado al arrancar y durante el OTA; duración acotada a 120 s; apagado por tiempo medido en el propio nodo; sesión limpia (no riega órdenes viejas).
2. **Backend**: no solapa órdenes; espera entre riegos; expira las órdenes sin confirmación.
3. **`MODO_ESCRITURA`**: solo el backend desplegado publica órdenes.
4. **Permisos del broker** (sección 5).

### Credencial para publicar órdenes

Para ordenar, el backend necesita una credencial de HiveMQ con permiso de **Publish** en `{PREFIX}/+/comando`. Las cuentas personales (`gda_alvaro`, `gda_luquita`…) son *Subscribe only*: sirven para mirar, **no para regar**. Para probar el riego hace falta `gda_backend` (producción) o una credencial de desarrollo con publish, que crea quien administra HiveMQ.

### Modo de compatibilidad `CONTROL_RIEGO=nodo`

Existe solo para cuando el nodo corre el **sketch de prueba** `ESP32_GDA_prueba_riego.ino` (riega solo con una regla local de 50–55 % y no procesa comandos). El backend observa: registra los riegos del nodo desde sus eventos y alerta, pero no ordena (el riego manual responde `409 NODE_NO_COMMANDS`). **No usarlo con `gda-nodo-v2`.**

### Recomendaciones sobre la telemetría

- **Intervalo**: `gda-nodo-v2` publica cada 30 s (`TELEMETRIA_MS`) para pruebas. A 30 s son ~2.900 lecturas por día por nodo (≈1,2 MB/día en Atlas: el plan gratis de 512 MB alcanzaría más de un año). A 10 min (el ciclo de diseño) son ≈0,06 MB/día. A 5 s serían ~17 mil por día (≈7 MB/día): evitarlo.
- **Marca de tiempo**: el nodo no manda timestamp y el backend usa la hora de recepción. Si dos backends consumen el mismo prefijo y comparten base de datos, cada uno guarda su copia de la misma lectura. Sincronizando NTP en el nodo y enviando `measuredAt` (epoch en segundos) la lectura queda idempotente y habilita la retransmisión offline (RNF4).

## 5. Protecciones contra riegos accidentales (dos capas)

1. **Permisos del broker**: las cuentas personales son _Subscribe only_ — HiveMQ rechaza cualquier `publish` a `.../comando` aunque el código lo intente. Para regar hace falta una credencial con Publish (sección 4).
2. **`MODO_ESCRITURA` en el backend**: con `false` (obligatorio en local), el motor evalúa y **registra** la decisión (evento `[modo lectura] riego omitido`), pero no publica la orden. Solo el backend desplegado corre con `true`.

## 6. Despliegue

El backend desplegado (Railway/Fly.io) solo necesita salida a internet — **ya no hace falta TCP proxy ni puerto MQTT propio**, porque el broker vive en HiveMQ. Variables: `MQTT_HOST/PORT/USER/PASS` con la credencial `gda_backend` (Publish+Subscribe), `MQTT_CLIENT_ID` único, `TOPIC_PREFIX=gda/prod`, `MODO_ESCRITURA=true` y `CONTROL_RIEGO=backend` (el default).

## 7. Límites del plan gratuito

| Servicio      | Límite                    | ¿Alcanza?                  |
| ------------- | ------------------------- | -------------------------- |
| HiveMQ Cloud  | 100 conexiones, 10 GB/mes | Sí — a 30 s son ~17 MB/mes; a 10 min, ~1 MB/mes |
| MongoDB Atlas | 512 MB                    | Sí                         |

admin@gda.local
gda123456678

MQTT_USER=gda_alvaro
MQTT_PASS=alvarogda2026
