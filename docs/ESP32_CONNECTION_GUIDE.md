# Instructivo de conexión — ESP32 al sistema GDA

Este documento explica, paso a paso, cómo conectar un ESP32 físico (con sensor de humedad de suelo, sensor DHT de temperatura/humedad de aire y una bomba/válvula de riego) al sistema GDA ya desplegado.

> **¿Tenés el hardware en la mano?** La guía práctica con el cableado exacto (FC-28 + AM2302 + relé 5V), la instalación del Arduino IDE, la calibración y el firmware completo listo para cargar está en [GUIA_HARDWARE_FIRMWARE.md](GUIA_HARDWARE_FIRMWARE.md). Este documento queda como **referencia del contrato de comunicación** (topics, formato de mensajes, despliegue).

---

## 1. Cómo se comunica el ESP32 con el sistema

El backend de GDA incluye un **broker MQTT embebido** (protocolo liviano, ideal para microcontroladores). El ESP32 se conecta una sola vez por TCP y por esa misma conexión:

- **publica** su telemetría periódica,
- **recibe** las órdenes de riego,
- **confirma** la ejecución de cada orden.

| Parámetro | Valor |
|---|---|
| Protocolo | MQTT 3.1.1 sobre TCP |
| Host | La IP/dominio donde corre el backend GDA |
| Puerto | `1883` (configurable con `MQTT_PORT` en el backend) |
| Usuario MQTT | El **Node ID** de la maceta |
| Contraseña MQTT | El **Device Token** de la maceta |
| Client ID | El mismo Node ID |
| Sesión | `cleanSession = false` (para no perder comandos durante cortes) |

### Topics (reemplazar `{nodeId}` por el Node ID real)

| Topic | Dirección | Contenido |
|---|---|---|
| `gda/{nodeId}/telemetry` | ESP32 → backend | Telemetría periódica (JSON) |
| `gda/{nodeId}/command` | backend → ESP32 | Órdenes de riego (JSON) — **suscribirse con QoS 1** |
| `gda/{nodeId}/ack` | ESP32 → backend | Confirmación de ejecución (JSON) |

Cada ESP32 solo puede usar los topics de **su propio** nodeId: el broker rechaza cualquier otro.

---

## 2. Datos de configuración que necesita el firmware

Antes de compilar, el firmware necesita estas constantes:

```cpp
// Red WiFi
const char* WIFI_SSID     = "TU_RED_WIFI";
const char* WIFI_PASSWORD = "TU_PASSWORD_WIFI";

// Servidor GDA (broker MQTT embebido en el backend)
const char* MQTT_HOST = "192.168.x.x";   // IP local o dominio del backend desplegado
const int   MQTT_PORT = 1883;

// Identidad del nodo — se obtienen al CREAR LA MACETA en el dashboard
// (Macetas → Nueva maceta → diálogo "Credenciales del nodo").
// También se pueden consultar en el detalle de la maceta.
const char* NODE_ID      = "maceta-01";                              // usuario MQTT
const char* DEVICE_TOKEN = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";   // contraseña MQTT
```

Además el ESP32 debe **sincronizar el reloj por NTP** al arrancar (ej. `configTime(0, 0, "pool.ntp.org")`), porque cada lectura lleva su timestamp real. Ese timestamp es lo que permite que el backend no duplique lecturas retransmitidas.

---

## 3. Formato exacto de los mensajes

### 3.1 Telemetría (ESP32 publica en `gda/{nodeId}/telemetry`)

```json
{
  "soilMoisture": 42.5,
  "temperature": 24.3,
  "airHumidity": 61.0,
  "measuredAt": 1720549200,
  "source": "live"
}
```

| Campo | Tipo | Regla |
|---|---|---|
| `soilMoisture` | número | 0–100 (%). Fuera de rango se guarda marcada como inválida |
| `temperature` | número | -40 a 80 (°C) |
| `airHumidity` | número | 0–100 (%) |
| `measuredAt` | entero | Epoch **en segundos** del momento de la medición (NTP) |
| `source` | string | `"live"` en el ciclo normal; `"replay"` al retransmitir lecturas acumuladas offline |

**Frecuencia recomendada:** una lectura cada 10 minutos (el ciclo de diseño del sistema).

**Tolerancia a cortes:** si no hay conexión, guardar la lectura en memoria/flash con su `measuredAt` original y, al reconectar, publicar todo lo acumulado con `"source": "replay"`. El backend deduplica por (nodeId + measuredAt): retransmitir dos veces no genera duplicados.

### 3.2 Orden de riego (ESP32 recibe en `gda/{nodeId}/command`)

```json
{
  "commandId": "d0a1b2c3-...-uuid",
  "action": "regar",
  "durationSec": 5
}
```

Al recibirla, el ESP32 debe activar la bomba/válvula durante `durationSec` segundos.

### 3.3 Confirmación (ESP32 publica en `gda/{nodeId}/ack` al terminar)

```json
{
  "commandId": "d0a1b2c3-...-uuid",
  "ok": true,
  "executedDurationSec": 5,
  "detail": "Riego ejecutado correctamente"
}
```

- `commandId` debe ser **el mismo** que llegó en la orden.
- Si el riego falló (bomba no respondió, error de hardware): `"ok": false` y el motivo en `detail`.
- **Importante:** el backend espera el ack dentro de los **60 segundos** (configurable). Sin ack, la orden se marca como fallida por timeout.

### 3.4 Esqueleto de referencia (Arduino / PubSubClient)

```cpp
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>

WiFiClient espClient;
PubSubClient mqtt(espClient);

String topicTelemetry = String("gda/") + NODE_ID + "/telemetry";
String topicCommand   = String("gda/") + NODE_ID + "/command";
String topicAck       = String("gda/") + NODE_ID + "/ack";

void onCommand(char* topic, byte* payload, unsigned int length) {
  StaticJsonDocument<256> cmd;
  deserializeJson(cmd, payload, length);
  if (strcmp(cmd["action"], "regar") == 0) {
    int duration = cmd["durationSec"];
    digitalWrite(PUMP_PIN, HIGH);
    delay(duration * 1000UL);          // en producción usar millis(), no delay()
    digitalWrite(PUMP_PIN, LOW);

    StaticJsonDocument<256> ack;
    ack["commandId"] = cmd["commandId"];
    ack["ok"] = true;
    ack["executedDurationSec"] = duration;
    char buf[256];
    serializeJson(ack, buf);
    mqtt.publish(topicAck.c_str(), buf);
  }
}

void connectMqtt() {
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onCommand);
  while (!mqtt.connected()) {
    // clientId = NODE_ID, user = NODE_ID, pass = DEVICE_TOKEN, cleanSession = false
    if (mqtt.connect(NODE_ID, NODE_ID, DEVICE_TOKEN, nullptr, 0, false, nullptr, false)) {
      mqtt.subscribe(topicCommand.c_str(), 1);
    } else {
      delay(3000);
    }
  }
}

void publishTelemetry(float soil, float temp, float air) {
  StaticJsonDocument<256> doc;
  doc["soilMoisture"] = soil;
  doc["temperature"]  = temp;
  doc["airHumidity"]  = air;
  doc["measuredAt"]   = time(nullptr);   // epoch en segundos (NTP)
  doc["source"]       = "live";
  char buf[256];
  serializeJson(doc, buf);
  mqtt.publish(topicTelemetry.c_str(), buf);
}
```

---

## 4. Verificación paso a paso

1. **Registrar la maceta** en el dashboard (Macetas → Nueva maceta) con el `nodeId` elegido. Guardar el `deviceToken` que muestra el diálogo.
2. **Cargar el firmware** con WiFi + host/puerto + nodeId/token, y encender el ESP32.
3. **En el dashboard → Macetas**: en menos de un minuto la maceta debe pasar de `offline` a **`online`** (badge verde). Eso confirma que la conexión y autenticación MQTT funcionaron.
4. **Esperar el primer ciclo de telemetría**: en el Dashboard, la tarjeta de la maceta debe mostrar humedad de suelo, temperatura y humedad de aire, y "Última lectura" con la hora actual. Los valores se actualizan **sin recargar la página**.
5. **Probar el circuito de riego completo**: botón "Regar ahora" en la tarjeta → el ESP32 debe activar la bomba y, al terminar, en el detalle de la maceta el evento "Riego manual" debe pasar de `pendiente` a **`confirmado`**.
6. **Probar la tolerancia a cortes** (opcional): desconectar el WiFi del ESP32 unos minutos. La maceta pasa a `offline` y, a los 15 minutos, se genera la alerta "fallo de sensor". Al volver la conexión, las lecturas acumuladas aparecen en el historial marcadas como `retransmitida`, sin duplicados.

---

## 5. Si el nodo no aparece como conectado — checklist de diagnóstico

1. **¿El ESP32 tiene WiFi?** Verificar por serial que obtuvo IP en la misma red (o con salida hacia el servidor).
2. **¿Host y puerto correctos?** Desde una PC en la misma red: `telnet <MQTT_HOST> 1883` (o `Test-NetConnection <host> -Port 1883` en PowerShell) debe conectar. Si no conecta, revisar firewall del servidor o el port-forwarding.
3. **¿Credenciales exactas?** El usuario MQTT es el `nodeId` y la contraseña el `deviceToken`, copiados sin espacios. Si el broker rechaza la conexión (rc=4/5 en PubSubClient), es credencial incorrecta o la maceta está **inactiva** o no existe.
4. **¿La maceta está activa?** En el dashboard la maceta debe figurar `activa`. Una maceta eliminada (inactiva) no puede autenticarse.
5. **¿El backend está corriendo?** `GET http://<host>:4000/health` debe responder `{"ok":true}` y el log del backend debe decir `Broker MQTT escuchando en puerto 1883`.
6. **¿Aparece online pero sin datos?** Revisar que el JSON de telemetría tenga los nombres de campos exactos y `measuredAt` en **segundos** (no milisegundos): el log del backend avisa `Telemetría malformada` o `rechazada` con el motivo.
7. **¿Lecturas marcadas inválidas?** Los valores están fuera de rango físico (ej. sensor desconectado leyendo -999): revisar el cableado/calibración del sensor.
8. **Probar con el simulador** para aislar el problema: `node simulator/index.js --node <nodeId>:<token> --server mqtt://<host>:1883`. Si el simulador conecta y el ESP32 no, el problema está en el firmware/red del ESP32, no en el servidor.

---

## 6. Despliegue en producción (Railway)

El plan del proyecto usa Railway para el backend. Para exponer el puerto MQTT además del HTTP:

1. En Railway → servicio del backend → **Settings → Networking → TCP Proxy**: crear un proxy TCP apuntando al puerto `1883` del contenedor.
2. Railway asigna un host y puerto públicos (ej. `containers-xyz.railway.app:34567`): esos son los `MQTT_HOST`/`MQTT_PORT` que van en el firmware.
3. La API HTTP sigue saliendo por el dominio normal del servicio (puerto 443/80): el TCP proxy es solo para MQTT.
