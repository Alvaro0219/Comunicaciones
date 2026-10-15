/* ============================================================
   GEMELO DIGITAL AGRICOLA (GDA) - Nodo IoT v2
   WiFiMulti + HiveMQ Cloud (TLS) + OTA + Telnet

   EL NODO NO DECIDE: MIDE Y EJECUTA.
     - Mide la humedad del suelo (FC-28) y la publica por MQTT.
     - Ejecuta las ordenes de riego que manda el backend y
       confirma cuando la bomba se enciende y se apaga.
   Toda la logica (umbrales, pronostico, riego automatico y
   manual) vive en el backend. Este sketch NO tiene reglas de
   riego propias.

   Contrato MQTT (docs/ESP32_CONNECTION_GUIDE.md):
     publica  {PREFIX}/{NODO_ID}/telemetria  cada TELEMETRIA_MS
     escucha  {PREFIX}/{NODO_ID}/comando     {"activar_riego":true,"duracion_seg":5,"commandId":"..."}
     publica  {PREFIX}/{NODO_ID}/evento      en cada cambio de la bomba

   Librerias (Administrar bibliotecas):
     PubSubClient (Nick O'Leary) y ArduinoJson (Benoit Blanchon, v7.x)
   Placa: ESP32 Dev Module. Partition Scheme: Minimal SPIFFS (1.9MB APP with OTA).
   Requiere secrets.h en esta carpeta (ver secrets.h.example).
   ============================================================ */

#include <WiFi.h>
#include <WiFiMulti.h>
#include <WiFiClientSecure.h>
#include <ESPmDNS.h>
#include <ArduinoOTA.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "secrets.h"

/* ---------- BROKER ---------- */
const char* MQTT_HOST = "fe6b7e466a1e43c7ba4a2cb5dcc50a39.s1.eu.hivemq.cloud";
const int   MQTT_PORT = 8883;

const char* NODO_ID  = "nodo1";       // debe coincidir con el Node ID de la maceta en el dashboard
const char* HOSTNAME = "gda-nodo1";
const int   MACETA_ID = 1;

// Prefijo de topics. Tiene que ser el MISMO TOPIC_PREFIX que usa el backend.
//   "gda/prod"          -> sistema real
//   "gda/dev-<nombre>"  -> pruebas de una persona, sin interferir con produccion
const char* PREFIX = "gda/prod";

/* ---------- SENSOR SUELO (FC-28) ---------- */
const int PIN_SUELO = 34;

// CALIBRACION: reemplazar por los valores medidos con TU sensor
// (ver docs/GDA_Documentacion_Nodo1.md, seccion 6).
const int SUELO_SECO   = 3500;   // valor crudo con la horquilla al aire
const int SUELO_MOJADO = 1500;   // valor crudo con la horquilla en agua

// true = imprime el valor crudo del ADC en cada medicion (util para calibrar)
const bool LOG_CRUDO = true;

/* ---------- RELE / BOMBA ---------- */
const int PIN_RELE = 26;

// La mayoria de los modulos de rele se activan con LOW.
// Si la bomba se prende cuando deberia estar apagada, cambiar a false.
const bool RELE_ACTIVO_BAJO = true;

// Tope duro de seguridad por orden. El backend pide una duracion, pero el nodo
// NUNCA riega mas que esto aunque la orden diga otra cosa (orden erronea, bug).
const unsigned long DURACION_MAX_S = 120;

/* ---------- TELEMETRIA ---------- */
// 30 s para pruebas. En produccion subir (el ciclo de diseno es 600000 = 10 min).
const unsigned long TELEMETRIA_MS = 30000;

/* ---------- CERTIFICADO ISRG Root X1 (Let's Encrypt) ---------- */
const char* CA_CERT = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)EOF";

/* ---------- OBJETOS ---------- */
WiFiMulti wifiMulti;
WiFiServer telnet(23);
WiFiClient cliente;
WiFiClientSecure net;
PubSubClient mqtt(net);

char topic_telemetria[50];
char topic_comando[50];
char topic_evento[50];

/* ---------- ESTADO ---------- */
bool bombaEncendida = false;
unsigned long tBombaInicio = 0;
unsigned long tBombaFin = 0;     // millis() en que la bomba DEBE apagarse
char ordenId[48] = "";           // commandId de la orden en curso
int humedadActual = -1;          // ultima medicion (-1 = todavia no hubo)
int ultimoCrudo = 0;

// Evento que no se pudo publicar (MQTT caido cuando cambio la bomba).
// Se reintenta al reconectar: sin el aviso de apagado, el backend creeria que la orden fallo.
char eventoPendiente[256] = "";

/* ---------- LOG (serie + telnet) ---------- */
void log(const String& msg) {
  Serial.println(msg);
  if (cliente && cliente.connected()) cliente.println(msg);
}

/* ---------- RELE ---------- */
void escribirRele(bool encender) {
  // Traduce "encender" al nivel electrico segun el tipo de modulo
  bool nivel = RELE_ACTIVO_BAJO ? !encender : encender;
  digitalWrite(PIN_RELE, nivel ? HIGH : LOW);
}

/* ---------- SENSOR SUELO ---------- */
int leerHumedadSuelo() {
  // Promedio de 10 lecturas: el FC-28 es ruidoso
  long suma = 0;
  for (int i = 0; i < 10; i++) {
    suma += analogRead(PIN_SUELO);
    delay(20);
  }
  ultimoCrudo = suma / 10;

  // Conversion a porcentaje. Rango invertido a proposito:
  // en el FC-28, valor mas alto = tierra mas seca.
  int pct = map(ultimoCrudo, SUELO_SECO, SUELO_MOJADO, 0, 100);
  return constrain(pct, 0, 100);
}

/* ---------- EVENTOS ---------- */
void publicarEvento(bool bomba, const char* motivo, int duracionSeg) {
  JsonDocument doc;
  doc["maceta_id"] = MACETA_ID;
  doc["bomba"] = bomba;
  if (humedadActual >= 0) doc["humedad"] = humedadActual;
  doc["motivo"] = motivo;
  if (duracionSeg > 0) doc["duracion_seg"] = duracionSeg;   // segundos realmente encendida
  if (ordenId[0]) doc["commandId"] = ordenId;

  char buf[256];
  serializeJson(doc, buf, sizeof(buf));

  if (mqtt.connected() && mqtt.publish(topic_evento, buf)) {
    log("EVENTO: " + String(buf));
  } else {
    strncpy(eventoPendiente, buf, sizeof(eventoPendiente) - 1);
    eventoPendiente[sizeof(eventoPendiente) - 1] = '\0';
    log("EVENTO en cola (sin MQTT): " + String(buf));
  }
}

/* ---------- BOMBA ---------- */
void iniciarRiego(int duracionSeg, const char* commandId) {
  if (duracionSeg < 1) {
    log("Orden ignorada: falta duracion_seg valida");
    return;
  }
  if (bombaEncendida) {
    log("Orden ignorada: ya hay un riego en curso");
    return;
  }
  if (duracionSeg > (int)DURACION_MAX_S) {
    log("Duracion acotada de " + String(duracionSeg) + " s a " + String(DURACION_MAX_S) + " s");
    duracionSeg = DURACION_MAX_S;
  }

  humedadActual = leerHumedadSuelo();   // medicion fresca para el evento

  strncpy(ordenId, commandId, sizeof(ordenId) - 1);
  ordenId[sizeof(ordenId) - 1] = '\0';

  bombaEncendida = true;
  tBombaInicio = millis();
  tBombaFin = tBombaInicio + (unsigned long)duracionSeg * 1000UL;
  escribirRele(true);
  log("BOMBA ON por " + String(duracionSeg) + " s | humedad=" + String(humedadActual) + "%");
  publicarEvento(true, "orden de riego", 0);
}

void detenerRiego(const char* motivo) {
  if (!bombaEncendida) return;
  escribirRele(false);             // primero apagar, despues todo lo demas
  bombaEncendida = false;
  int duracionSeg = (int)((millis() - tBombaInicio + 500) / 1000);

  humedadActual = leerHumedadSuelo();
  log("BOMBA OFF tras " + String(duracionSeg) + " s | humedad=" + String(humedadActual) + "% | " + motivo);
  publicarEvento(false, motivo, duracionSeg);
  ordenId[0] = '\0';
}

// El apagado lo decide el TIEMPO de la orden, medido aca en el nodo: si despues de
// encender se cae el WiFi o el broker, la bomba igual se apaga cuando vence.
void servicioBomba() {
  if (bombaEncendida && (long)(millis() - tBombaFin) >= 0) {
    detenerRiego("fin de riego");
  }
}

/* ---------- TELEMETRIA ---------- */
void publicarTelemetria() {
  humedadActual = leerHumedadSuelo();
  if (LOG_CRUDO) log("crudo=" + String(ultimoCrudo));

  JsonDocument doc;
  doc["maceta_id"] = MACETA_ID;
  doc["humedad"] = humedadActual;
  doc["bomba"] = bombaEncendida;
  doc["rssi"] = WiFi.RSSI();
  doc["ssid"] = WiFi.SSID();
  doc["ip"] = WiFi.localIP().toString();
  doc["heap"] = ESP.getFreeHeap();

  char buf[256];
  serializeJson(doc, buf, sizeof(buf));

  if (mqtt.publish(topic_telemetria, buf)) {
    log("TX: " + String(buf));
  } else {
    log("Fallo publish");
  }
}

/* ---------- WIFI ---------- */
void cargarRedes() {
  wifiMulti.addAP(WIFI_SSID_1, WIFI_PASS_1);
  wifiMulti.addAP(WIFI_SSID_2, WIFI_PASS_2);
  wifiMulti.addAP(WIFI_SSID_3, WIFI_PASS_3);
}

void conectarWiFi() {
  Serial.print("Buscando red");
  while (wifiMulti.run() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.println("Red:  " + WiFi.SSID());
  Serial.println("IP:   " + WiFi.localIP().toString());
  Serial.println("RSSI: " + String(WiFi.RSSI()));
}

/* ---------- MQTT ---------- */
// Orden del backend: {"activar_riego":true,"duracion_seg":5,"commandId":"..."}
// {"activar_riego":false} es una parada de emergencia.
void onMessage(char* topic, byte* payload, unsigned int len) {
  String msg;
  for (unsigned int i = 0; i < len; i++) msg += (char)payload[i];
  log("RX [" + String(topic) + "]: " + msg);

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, msg);
  if (err) {
    log("Comando ilegible: " + String(err.c_str()));
    return;
  }
  if (!doc["activar_riego"].is<bool>()) return;

  if (doc["activar_riego"].as<bool>()) {
    int duracionSeg = doc["duracion_seg"] | 0;
    const char* commandId = doc["commandId"] | "";
    iniciarRiego(duracionSeg, commandId);
  } else {
    detenerRiego("orden de detencion");
  }
}

// Un solo intento cada 5 s, sin bloquear: la bomba se sigue controlando por tiempo.
void reconectarMQTT() {
  static unsigned long tIntento = 0;
  static bool intentado = false;
  if (intentado && millis() - tIntento < 5000) return;
  intentado = true;
  tIntento = millis();

  log("Conectando a HiveMQ...");
  String cid = "esp32-" + String(NODO_ID);
  // Sesion limpia a proposito: una orden publicada mientras el nodo estaba desconectado
  // NO se entrega al volver. Regar tarde por una orden vieja es peor que no regar.
  if (mqtt.connect(cid.c_str(), MQTT_USER, MQTT_PASS)) {
    log("MQTT OK");
    mqtt.subscribe(topic_comando, 1);
    log("Suscrito a " + String(topic_comando));
  } else {
    log("Fallo, rc=" + String(mqtt.state()));
  }
}

/* ---------- SETUP ---------- */
void setup() {
  // Rele apagado ANTES que nada: fijar el nivel y despues configurar
  // el pin como salida evita un pulso que prenda la bomba al arrancar
  escribirRele(false);
  pinMode(PIN_RELE, OUTPUT);
  escribirRele(false);

  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== GDA nodo v2 (mide y ejecuta) ===");

  analogReadResolution(12);
  analogSetPinAttenuation(PIN_SUELO, ADC_11db);  // rango completo 0-3.3V

  WiFi.mode(WIFI_STA);
  cargarRedes();
  conectarWiFi();

  if (MDNS.begin(HOSTNAME)) {
    Serial.println("mDNS: " + String(HOSTNAME) + ".local");
  }

  ArduinoOTA.setHostname(HOSTNAME);
  ArduinoOTA.setPassword(OTA_PASS);
  ArduinoOTA.onStart([]() {
    escribirRele(false);              // bomba apagada durante el OTA
    bombaEncendida = false;
    Serial.println("OTA iniciando...");
  });
  ArduinoOTA.onProgress([](unsigned int p, unsigned int t) {
    Serial.printf("OTA %u%%\r", (p * 100) / t);
  });
  ArduinoOTA.onEnd([]() { Serial.println("\nOTA completo."); });
  ArduinoOTA.onError([](ota_error_t e) { Serial.printf("OTA error [%u]\n", e); });
  ArduinoOTA.begin();
  Serial.println("OTA listo");

  telnet.begin();
  telnet.setNoDelay(true);
  Serial.println("Telnet listo -> puerto 23");

  snprintf(topic_telemetria, sizeof(topic_telemetria), "%s/%s/telemetria", PREFIX, NODO_ID);
  snprintf(topic_comando,    sizeof(topic_comando),    "%s/%s/comando",    PREFIX, NODO_ID);
  snprintf(topic_evento,     sizeof(topic_evento),     "%s/%s/evento",     PREFIX, NODO_ID);

  net.setCACert(CA_CERT);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(512);
  mqtt.setCallback(onMessage);
}

/* ---------- LOOP ---------- */
void loop() {
  ArduinoOTA.handle();

  // El apagado por tiempo va PRIMERO y no depende de la red.
  servicioBomba();

  /* WiFi: chequeo cada 10 s. No en cada vuelta:
     wifiMulti.run() escanea redes y bloquea ~2 s. */
  static unsigned long tWifi = 0;
  if (millis() - tWifi > 10000) {
    tWifi = millis();
    if (wifiMulti.run() != WL_CONNECTED) {
      log("WiFi caido, reintentando...");
    }
  }
  if (WiFi.status() != WL_CONNECTED) return;

  /* Cliente telnet nuevo */
  if (telnet.hasClient()) {
    if (cliente) cliente.stop();
    cliente = telnet.available();
    cliente.println("=== GDA " + String(NODO_ID) + " ===");
  }

  if (!mqtt.connected()) reconectarMQTT();
  mqtt.loop();

  /* Reenviar el evento que no pudo publicarse */
  if (eventoPendiente[0] && mqtt.connected()) {
    if (mqtt.publish(topic_evento, eventoPendiente)) {
      log("EVENTO reenviado: " + String(eventoPendiente));
      eventoPendiente[0] = '\0';
    }
  }

  /* Telemetria: la primera apenas conecta, despues cada TELEMETRIA_MS */
  static unsigned long tTelemetria = 0;
  static bool primera = true;
  if (mqtt.connected() && (primera || millis() - tTelemetria >= TELEMETRIA_MS)) {
    primera = false;
    tTelemetria = millis();
    publicarTelemetria();
  }
}
