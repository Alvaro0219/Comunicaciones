// ─────────────────────────────────────────────────────────────────
//  Firmware del nodo GDA — ESP32-WROOM-32
//  Sensores: FC-28 (humedad de suelo, analógico) + AM2302/DHT22 (aire)
//  Actuador: módulo de relé 5V (bomba/válvula de riego)
//
//  Contrato MQTT (ver docs/ESP32_CONNECTION_GUIDE.md):
//    publica  gda/{NODE_ID}/telemetry   telemetría periódica
//    escucha  gda/{NODE_ID}/command     órdenes de riego
//    publica  gda/{NODE_ID}/ack         confirmación de ejecución
//
//  Librerías (Arduino IDE → Library Manager):
//    - PubSubClient (Nick O'Leary)
//    - ArduinoJson (Benoit Blanchon, v7)
//    - DHT sensor library (Adafruit) + Adafruit Unified Sensor
// ─────────────────────────────────────────────────────────────────

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <time.h>
#include "config.h"

WiFiClient espClient;
PubSubClient mqtt(espClient);
DHT dht(PIN_DHT, DHT22);   // el AM2302 es un DHT22 con cable

String topicTelemetry = String("gda/") + NODE_ID + "/telemetry";
String topicCommand   = String("gda/") + NODE_ID + "/command";
String topicAck       = String("gda/") + NODE_ID + "/ack";

// ── Buffer offline: si se corta la conexión, las lecturas se acumulan
//    acá (RAM) y se retransmiten al reconectar con source:"replay".
//    144 lecturas = 24 h de datos al ciclo de 10 minutos.
struct Reading {
  float soil;
  float temp;
  float air;
  time_t ts;
};
const int BUF_SIZE = 144;
Reading ringBuf[BUF_SIZE];
int bufHead = 0;   // próxima posición de escritura
int bufCount = 0;

// ── Estado del riego (no bloqueante: el loop sigue corriendo) ──
bool irrigating = false;
unsigned long irrigationEndMs = 0;
char pendingCommandId[48] = "";
int pendingDurationSec = 0;

unsigned long lastTelemetryMs = 0;
unsigned long lastMqttAttemptMs = 0;

// ─────────────────────────────────────────────────────────────────
//  Relé y sensores
// ─────────────────────────────────────────────────────────────────

void relayWrite(bool on) {
  bool level = RELAY_ACTIVE_LOW ? !on : on;
  digitalWrite(PIN_RELAY, level ? HIGH : LOW);
}

// FC-28: el ADC del ESP32 da ~4095 en seco y baja al mojarse.
// Se mapea con los valores de calibración a 0–100 %.
float readSoilPct(int *rawOut) {
  int raw = analogRead(PIN_SOIL);
  if (rawOut) *rawOut = raw;
  float pct = 100.0f * (float)(SOIL_RAW_AIR - raw) / (float)(SOIL_RAW_AIR - SOIL_RAW_WATER);
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return pct;
}

bool clockSynced() {
  return time(nullptr) > 1700000000;   // cualquier fecha real posterior a 2023
}

// ─────────────────────────────────────────────────────────────────
//  Telemetría
// ─────────────────────────────────────────────────────────────────

bool publishReading(const Reading &r, const char *source) {
  JsonDocument doc;
  doc["soilMoisture"] = ((int)(r.soil * 10)) / 10.0;
  doc["temperature"]  = ((int)(r.temp * 10)) / 10.0;
  doc["airHumidity"]  = ((int)(r.air * 10)) / 10.0;
  doc["measuredAt"]   = (uint32_t)r.ts;
  doc["source"]       = source;

  char payload[192];
  serializeJson(doc, payload, sizeof(payload));
  return mqtt.publish(topicTelemetry.c_str(), payload);
}

void bufferReading(const Reading &r) {
  ringBuf[bufHead] = r;
  bufHead = (bufHead + 1) % BUF_SIZE;
  if (bufCount < BUF_SIZE) bufCount++;   // lleno: pisa la más vieja
  Serial.printf("[buffer] lectura almacenada offline (%d en buffer)\n", bufCount);
}

void flushBuffer() {
  if (bufCount == 0) return;
  Serial.printf("[buffer] retransmitiendo %d lectura(s) acumuladas...\n", bufCount);
  int start = (bufHead - bufCount + BUF_SIZE) % BUF_SIZE;
  for (int i = 0; i < bufCount; i++) {
    publishReading(ringBuf[(start + i) % BUF_SIZE], "replay");
    mqtt.loop();
    delay(50);   // no saturar el broker
  }
  bufCount = 0;
}

void takeAndSendTelemetry() {
  if (!clockSynced()) {
    Serial.println("[ntp] reloj sin sincronizar todavia: lectura omitida");
    return;
  }

  float temp = dht.readTemperature();
  float air  = dht.readHumidity();
  if (isnan(temp) || isnan(air)) {
    Serial.println("[dht] lectura invalida del AM2302 (NaN): revisar cableado/pull-up");
    return;
  }

  int raw = 0;
  Reading r;
  r.soil = readSoilPct(&raw);
  r.temp = temp;
  r.air  = air;
  r.ts   = time(nullptr);

  Serial.printf("[telemetria] suelo %.1f%% (raw %d) | %.1f C | aire %.1f%%\n",
                r.soil, raw, r.temp, r.air);

  if (mqtt.connected()) {
    publishReading(r, "live");
  } else {
    bufferReading(r);
  }
}

// ─────────────────────────────────────────────────────────────────
//  Órdenes de riego
// ─────────────────────────────────────────────────────────────────

void sendAck(const char *commandId, bool ok, int executedSec, const char *detail) {
  JsonDocument doc;
  doc["commandId"] = commandId;
  doc["ok"] = ok;
  doc["executedDurationSec"] = executedSec;
  doc["detail"] = detail;

  char payload[224];
  serializeJson(doc, payload, sizeof(payload));
  mqtt.publish(topicAck.c_str(), payload);
  Serial.printf("[ack] %s -> %s\n", commandId, ok ? "ok" : "fallo");
}

void onCommand(char *topic, byte *payload, unsigned int length) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, length)) {
    Serial.println("[cmd] comando ilegible (JSON invalido)");
    return;
  }
  const char *action = doc["action"] | "";
  const char *commandId = doc["commandId"] | "";
  int durationSec = doc["durationSec"] | 0;

  if (strcmp(action, "regar") != 0 || durationSec <= 0) return;

  if (irrigating) {
    // Ya hay un riego en curso: se rechaza para no encadenar la bomba
    sendAck(commandId, false, 0, "Riego ya en curso");
    return;
  }

  Serial.printf("[cmd] orden de riego recibida: %d s\n", durationSec);
  strncpy(pendingCommandId, commandId, sizeof(pendingCommandId) - 1);
  pendingDurationSec = durationSec;
  irrigating = true;
  irrigationEndMs = millis() + (unsigned long)durationSec * 1000UL;
  relayWrite(true);
}

void serviceIrrigation() {
  if (irrigating && (long)(millis() - irrigationEndMs) >= 0) {
    relayWrite(false);
    irrigating = false;
    Serial.println("[riego] completado, bomba apagada");
    if (mqtt.connected()) {
      sendAck(pendingCommandId, true, pendingDurationSec, "Riego ejecutado correctamente");
    }
    pendingCommandId[0] = '\0';
  }
}

// ─────────────────────────────────────────────────────────────────
//  Conectividad
// ─────────────────────────────────────────────────────────────────

void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("[wifi] conectando a %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(400);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[wifi] conectado, IP %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[wifi] sin conexion (se reintenta)");
  }
}

void ensureMqtt() {
  if (mqtt.connected() || WiFi.status() != WL_CONNECTED) return;
  if (millis() - lastMqttAttemptMs < 5000) return;   // backoff de 5 s
  lastMqttAttemptMs = millis();

  Serial.printf("[mqtt] conectando a %s:%d como %s... ", MQTT_HOST, MQTT_PORT, NODE_ID);
  // clientId = NODE_ID, user = NODE_ID, pass = DEVICE_TOKEN, cleanSession = false
  // (sesion persistente: el broker guarda los comandos QoS1 emitidos offline)
  bool connected = mqtt.connect(NODE_ID, NODE_ID, DEVICE_TOKEN,
                                nullptr, 0, false, nullptr, false);
  if (connected) {
    Serial.println("ok");
    mqtt.subscribe(topicCommand.c_str(), 1);
    flushBuffer();
  } else {
    // rc=4: credenciales rechazadas (nodeId/token) | rc=-2: no llega al host
    Serial.printf("fallo (rc=%d)\n", mqtt.state());
  }
}

// ─────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== Nodo GDA — " NODE_ID " ===");

  pinMode(PIN_RELAY, OUTPUT);
  relayWrite(false);                       // bomba apagada desde el arranque
  analogSetPinAttenuation(PIN_SOIL, ADC_11db);  // rango completo 0-3.3V
  dht.begin();

  ensureWifi();
  configTime(0, 0, NTP_SERVER);            // hora en UTC (el backend espera epoch)
  Serial.print("[ntp] sincronizando reloj");
  unsigned long start = millis();
  while (!clockSynced() && millis() - start < 15000) {
    delay(400);
    Serial.print(".");
  }
  Serial.println(clockSynced() ? " ok" : " sin exito (se reintenta en el loop)");

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onCommand);
  mqtt.setBufferSize(512);
}

void loop() {
  ensureWifi();
  ensureMqtt();
  mqtt.loop();
  serviceIrrigation();

  if (millis() - lastTelemetryMs >= (unsigned long)TELEMETRY_INTERVAL_S * 1000UL) {
    lastTelemetryMs = millis();
    takeAndSendTelemetry();
  }
}
