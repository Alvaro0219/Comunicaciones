#pragma once

// ╔══════════════════════════════════════════════════════════════╗
// ║  CONFIGURACIÓN DEL NODO GDA — este es el ÚNICO archivo que    ║
// ║  necesitás editar. Ver docs/GUIA_HARDWARE_FIRMWARE.md         ║
// ╚══════════════════════════════════════════════════════════════╝

// ── 1. Red WiFi (2.4 GHz; el ESP32 no soporta redes de 5 GHz) ──
#define WIFI_SSID     "TU_RED_WIFI"
#define WIFI_PASSWORD "TU_PASSWORD_WIFI"

// ── 2. Servidor GDA ──
// IP local de la PC donde corre el backend (ver con `ipconfig`),
// o el host del TCP proxy de Railway si ya está desplegado.
#define MQTT_HOST "192.168.1.100"
#define MQTT_PORT 1883

// ── 3. Identidad del nodo ──
// Se obtienen al crear la maceta en el dashboard (Macetas → Nueva maceta
// → diálogo "Credenciales del nodo").
#define NODE_ID      "maceta-01"
#define DEVICE_TOKEN "pegar-aca-el-device-token"

// ── 4. Pines (según el cableado de la guía) ──
#define PIN_SOIL   34    // FC-28 AO  → GPIO34 (ADC1, solo entrada)
#define PIN_DHT    4     // AM2302 DATA
#define PIN_RELAY  26    // IN del módulo de relé

// La mayoría de los módulos de relé de 5V son "activo en LOW"
// (el relé cierra cuando el pin va a 0V). Si el tuyo enciende al revés
// (bomba prendida en reposo), cambiá esto a false.
#define RELAY_ACTIVE_LOW true

// ── 5. Calibración del FC-28 (ver guía, sección 6) ──
// Lectura cruda del ADC con el sensor al aire (seco) y sumergido en agua.
// El monitor serie imprime "soil raw: XXXX" en cada lectura para calibrar.
#define SOIL_RAW_AIR   3300
#define SOIL_RAW_WATER 1300

// ── 6. Tiempos ──
// Intervalo de telemetría en segundos. Para probar usá 30;
// el ciclo de diseño del sistema en producción es 600 (10 minutos).
#define TELEMETRY_INTERVAL_S 30

// Servidor NTP para sincronizar el reloj (necesario para el timestamp
// de cada lectura; no hace falta tocarlo).
#define NTP_SERVER "pool.ntp.org"
