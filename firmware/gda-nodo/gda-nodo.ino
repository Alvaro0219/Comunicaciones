/* ============================================================
    GEMELO DIGITAL AGRICOLA (GDA) - Nodo IoT
    WiFiMulti + HiveMQ Cloud (TLS) + OTA + Telnet
    ------------------------------------------------------------
    Copia de referencia del firmware del nodo real (lo mantiene
    quien tiene el hardware — ver docs/GUIA_HARDWARE_FIRMWARE.md
    y el documento interno "GDA Guia Setup").
    Requiere un archivo secrets.h en esta carpeta (ver
    secrets.h.example). Placa: ESP32 Dev Module, Partition
    Scheme = Minimal SPIFFS (1.9MB APP with OTA).
    ============================================================ */

#include <WiFi.h>
#include <WiFiMulti.h>
#include <WiFiClientSecure.h>
#include <ESPmDNS.h>
#include <ArduinoOTA.h>
#include <PubSubClient.h>
#include "secrets.h"

/* ---------- BROKER ---------- */
const char* MQTT_HOST = "fe6b7e466a1e43c7ba4a2cb5dcc50a39.s1.eu.hivemq.cloud";
const int   MQTT_PORT = 8883;
const char* NODO_ID  = "nodo1";
const char* HOSTNAME = "gda-nodo1";
const char* PREFIX   = "gda/prod";

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

/* ---------- LOG (serie + telnet) ---------- */
void log(const String& msg) {
  Serial.println(msg);
  if (cliente && cliente.connected()) cliente.println(msg);
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
void onMessage(char* topic, byte* payload, unsigned int len) {
  String msg;
  for (unsigned int i = 0; i < len; i++) msg += (char)payload[i];
  log("RX [" + String(topic) + "]: " + msg);
}

void reconectarMQTT() {
  int intentos = 0;
  while (!mqtt.connected() && intentos < 3) {
    log("Conectando a HiveMQ...");
    String cid = "esp32-" + String(NODO_ID);
    if (mqtt.connect(cid.c_str(), MQTT_USER, MQTT_PASS)) {
      log("MQTT OK");
      mqtt.subscribe(topic_comando);
      log("Suscrito a " + String(topic_comando));
    } else {
      log("Fallo, rc=" + String(mqtt.state()));
      intentos++;
      delay(3000);
    }
  }
}

/* ---------- SETUP ---------- */
void setup() {
  Serial.begin(115200);
  delay(500);

  WiFi.mode(WIFI_STA);
  cargarRedes();
  conectarWiFi();

  if (MDNS.begin(HOSTNAME)) {
    Serial.println("mDNS: " + String(HOSTNAME) + ".local");
  }

  ArduinoOTA.setHostname(HOSTNAME);
  ArduinoOTA.setPassword(OTA_PASS);
  ArduinoOTA.onStart([]() { Serial.println("OTA iniciando..."); });
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

  /* WiFi: chequeo cada 10 s. No en cada vuelta:
     wifiMulti.run() escanea redes y bloquea ~2 s. */
  static unsigned long tWifi = 0;
  if (millis() - tWifi > 10000) {
    tWifi = millis();
    if (wifiMulti.run() != WL_CONNECTED) {
      log("WiFi caido, reintentando...");
      return;
    }
  }

  /* Cliente telnet nuevo */
  if (telnet.hasClient()) {
    if (cliente) cliente.stop();
    cliente = telnet.available();
    cliente.println("=== GDA " + String(NODO_ID) + " ===");
  }

  if (!mqtt.connected()) reconectarMQTT();
  mqtt.loop();

  /* Telemetria cada 5 s (subir a 600000 en produccion) */
  static unsigned long t = 0;
  if (millis() - t > 5000) {
    t = millis();
    String payload = "{\"maceta_id\":1"
                     + String(",\"rssi\":") + WiFi.RSSI()
                     + ",\"ssid\":\"" + WiFi.SSID() + "\""
                     + ",\"ip\":\"" + WiFi.localIP().toString() + "\""
                     + ",\"heap\":" + ESP.getFreeHeap() + "}";
    if (mqtt.publish(topic_telemetria, payload.c_str())) {
      log("TX: " + payload);
    } else {
      log("Fallo publish");
    }
  }
}
