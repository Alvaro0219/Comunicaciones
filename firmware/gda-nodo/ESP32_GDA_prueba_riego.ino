/* ============================================================
   GEMELO DIGITAL AGRICOLA (GDA) - Nodo IoT
   PRUEBA DE RIEGO LOCAL: FC-28 < 50 %  ->  rele ON  ->  bomba ON
   Mantiene WiFiMulti + HiveMQ (TLS) + OTA + Telnet del sketch original
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

/* ---------- SENSOR SUELO ---------- */
const int PIN_SUELO = 34;

// CALIBRACION: reemplazar por los valores medidos con TU sensor
const int SUELO_SECO   = 3500;   // valor crudo con la horquilla al aire
const int SUELO_MOJADO = 1500;   // valor crudo con la horquilla en agua

/* ---------- RELE / BOMBA ---------- */
const int PIN_RELE = 26;

// La mayoria de los modulos de rele chinos se activan con LOW.
// Si la bomba se prende cuando deberia estar apagada, cambiar a false.
const bool RELE_ACTIVO_BAJO = true;

// Regla de riego:
//   humedad < 50 %  -> prende la bomba
//   la bomba sigue prendida mientras la humedad este entre 50 y 55 %
//   humedad > 55 %  -> corta la bomba
const int UMBRAL_ON  = 50;
const int UMBRAL_OFF = 55;

// Respaldo de seguridad: solo actua si la humedad NUNCA pasa del 55 %
// (sensor suelto, horquilla fuera de la tierra, tanque vacio).
// Normalmente la bomba la corta la humedad, no este tiempo.
// Poner en 0 para desactivarlo (no recomendado con agua real).
const unsigned long BOMBA_MAX_ON_MS   = 120000;  // 2 min
const unsigned long BOMBA_PAUSA_MS    = 60000;   // 1 min de pausa despues de un corte por tiempo

bool bombaEncendida = false;
unsigned long tBombaOn = 0;
unsigned long tBloqueoHasta = 0;
int humedadActual = -1;

/* ---------- CERTIFICADO ISRG Root X1 ---------- */
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

/* ---------- LOG ---------- */
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

void setBomba(bool encender, const String& motivo) {
  if (encender == bombaEncendida) return;
  bombaEncendida = encender;
  escribirRele(encender);
  if (encender) tBombaOn = millis();

  String msg = String("BOMBA ") + (encender ? "ON" : "OFF")
             + " | humedad=" + humedadActual + "% | " + motivo;
  log(msg);

  if (mqtt.connected()) {
    String ev = "{\"maceta_id\":1,\"bomba\":" + String(encender ? "true" : "false")
              + ",\"humedad\":" + humedadActual
              + ",\"motivo\":\"" + motivo + "\"}";
    mqtt.publish(topic_evento, ev.c_str());
  }
}

/* ---------- SENSOR SUELO ---------- */
int leerHumedadSuelo() {
  // Promedio de 10 lecturas: el FC-28 es ruidoso
  long suma = 0;
  for (int i = 0; i < 10; i++) {
    suma += analogRead(PIN_SUELO);
    delay(20);
  }
  int crudo = suma / 10;

  // Conversion a porcentaje. Rango invertido a proposito:
  // en el FC-28, valor mas alto = tierra mas seca.
  int pct = map(crudo, SUELO_SECO, SUELO_MOJADO, 0, 100);
  return constrain(pct, 0, 100);
}

/* ---------- CONTROL DE RIEGO (cada 1 s) ---------- */
void controlRiego() {
  static unsigned long tCtrl = 0;
  if (millis() - tCtrl < 1000) return;
  tCtrl = millis();

  humedadActual = leerHumedadSuelo();

  // 1) Respaldo de seguridad por tiempo maximo (si esta habilitado)
  if (bombaEncendida && BOMBA_MAX_ON_MS > 0 && millis() - tBombaOn > BOMBA_MAX_ON_MS) {
    setBomba(false, "corte por tiempo maximo");
    tBloqueoHasta = millis() + BOMBA_PAUSA_MS;
    return;
  }

  // 2) En pausa de seguridad: no prender
  if (millis() < tBloqueoHasta) return;

  // 3) Logica de riego con histeresis
  if (!bombaEncendida && humedadActual < UMBRAL_ON) {
    setBomba(true, "humedad menor a 50");
  } else if (bombaEncendida && humedadActual > UMBRAL_OFF) {
    setBomba(false, "humedad mayor a 55");
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
      // Esperar 3 s SIN bloquear el riego: la bomba sigue
      // controlada por la humedad mientras se reintenta MQTT
      unsigned long tEspera = millis();
      while (millis() - tEspera < 3000) {
        controlRiego();
        ArduinoOTA.handle();
        delay(10);
      }
    }
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
  Serial.println("\n=== GDA prueba de riego ===");

  /* Sensor suelo */
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

  // El riego se controla PRIMERO y no depende del WiFi:
  // si se cae la red, la bomba igual se apaga cuando corresponde.
  controlRiego();

  /* WiFi: chequeo cada 10 s */
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

  /* Telemetria cada 5 s */
  static unsigned long t = 0;
  if (millis() - t > 5000) {
    t = millis();

    String payload = "{\"maceta_id\":1"
                   + String(",\"humedad\":") + humedadActual
                   + ",\"bomba\":" + (bombaEncendida ? "true" : "false")
                   + ",\"rssi\":" + WiFi.RSSI()
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
