# Gemelo Digital Agrícola (GDA) — Documentación del Nodo 1

Nodo IoT basado en ESP32 que mide la humedad del suelo de una maceta, controla una bomba de riego mediante un relé y publica telemetría a HiveMQ Cloud por MQTT sobre TLS. Admite actualizaciones de firmware por WiFi (OTA) y logs remotos por Telnet.

| Dato | Valor |
|---|---|
| Nodo | `nodo1` |
| Hostname / mDNS | `gda-nodo1` / `gda-nodo1.local` |
| Firmware actual | `ESP32_GDA_prueba_riego.ino` |
| Broker | HiveMQ Cloud, puerto 8883 (TLS) |
| Prefijo de tópicos | `gda/prod/nodo1/` |

---

## 1. Hardware

| Componente | Función | Estado en el firmware |
|---|---|---|
| ESP32 DevKit (ESP32 Dev Module) | Microcontrolador con WiFi | En uso |
| Sensor de humedad de suelo FC-28 (módulo + horquilla) | Mide humedad del suelo (analógico) | En uso |
| AM2302 / DHT22 | Temperatura y humedad ambiente | Conectado, **sin código todavía** |
| Módulo relé 1 canal (5 V) | Conmuta la bomba | En uso |
| Bomba de agua + fuente propia | Riego | Comandada por el relé |
| Cables Dupont, protoboard | Conexionado | — |

---

## 2. Conexionado

### 2.1 Tabla de conexiones

| Componente | Pata | Pin ESP32 | Color de cable |
|---|---|---|---|
| **FC-28** | VCC | 3V3 | Blanco |
| | GND | GND | Negro |
| | A0 (salida analógica) | **GPIO 34** | Amarillo |
| | D0 | — | Sin conectar |
| **AM2302** | VCC (+) | 3V3 | Blanco |
| | DATA | **GPIO 15** | Verde |
| | GND (−) | GND | Negro |
| **Relé** | VCC | 5V / VIN | Rojo |
| | GND | GND | Marrón |
| | IN | **GPIO 26** | Naranja |
| **Bomba** | + / − | Contactos COM y NO del relé, con fuente propia | — |

### 2.2 Convención de colores

| Color | Uso |
|---|---|
| Negro / marrón | Negativo (GND). Marrón para la masa del lado de potencia (relé). |
| Blanco | Positivo **3,3 V** |
| Rojo | Positivo **5 V** |
| Amarillo | Dato FC-28 (GPIO 34) |
| Verde | Dato AM2302 (GPIO 15) |
| Naranja | Control del relé (GPIO 26) |

Se usa blanco para 3,3 V y rojo para 5 V a propósito, para que no se confundan los dos positivos.

### 2.3 Esquema

```
                    ┌──────────────────────┐
   FC-28            │        ESP32         │            RELÉ
 ┌────────┐         │                      │         ┌────────┐
 │ VCC ───┼─blanco──┤ 3V3            VIN ──┼──rojo───┤ VCC    │
 │ GND ───┼─negro───┤ GND            GND ──┼─marrón──┤ GND    │
 │ A0  ───┼─amarillo┤ GPIO34      GPIO26 ──┼─naranja─┤ IN     │
 │ D0  (nc)│         │                      │         │ COM ───┼──┐
 └────────┘         │                      │         │ NO  ───┼─┐│
   AM2302           │                      │         └────────┘ ││
 ┌────────┐         │                      │                    ││
 │ VCC ───┼─blanco──┤ 3V3                  │   Fuente bomba (+)─┘│
 │ DATA ──┼─verde───┤ GPIO15               │   Bomba (+) ────────┘
 │ GND ───┼─negro───┤ GND                  │   Bomba (−) ── Fuente (−)
 └────────┘         └──────────────────────┘
```

### 2.4 Reglas importantes

- **El FC-28 va a 3V3, nunca a 5V.** Con 5V la salida A0 puede superar 3,3 V y dañar la entrada analógica del ESP32.
- **GPIO 34** es solo entrada y pertenece al ADC1, que sigue funcionando con WiFi activo. No moverlo a un pin del ADC2 (dejan de leer con WiFi).
- **AM2302:** si es el sensor suelto de 4 patas, agregar una resistencia de 10 kΩ entre VCC y DATA. Si es módulo de 3 pines, ya la trae.
- **GPIO 15** es un pin de arranque (strapping). Si la placa no bootea o no carga el firmware con el AM2302 conectado, desconectar el cable verde durante la carga, o mover el sensor a **GPIO 4** y actualizar el código.
- **El relé se alimenta de 5V/VIN** (5 V cuando el ESP32 está por USB), no de 3V3.
- **La bomba no se conecta al ESP32.** Va por los contactos COM y NO del relé, con su propia fuente.
- **Todas las masas unidas:** GND del ESP32, sensores y relé en común. En protoboard: un riel para 3V3 y otro para GND. El 5V del relé va directo al pin VIN, sin pasar por el riel de 3V3.

---

## 3. Software

### 3.1 Arduino IDE

1. Instalar Arduino IDE 2.x.
2. Archivo → Preferencias → "Gestor de URLs de Tarjetas Adicionales":
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
3. Herramientas → Placa → Gestor de tarjetas → instalar **esp32 (Espressif Systems)**.
4. Placa: **ESP32 Dev Module**.

### 3.2 Librerías

| Librería | Autor | ¿Necesaria hoy? |
|---|---|---|
| PubSubClient | Nick O'Leary | Sí |
| DHT sensor library for ESPx | beegee_tokyo | Para el AM2302 (futuro) |
| ArduinoJson | Benoit Blanchon | Futuro |

WiFi, WiFiMulti, WiFiClientSecure, ESPmDNS y ArduinoOTA vienen con el core del ESP32.

### 3.3 Configuración de la placa (Herramientas)

| Opción | Valor |
|---|---|
| Partition Scheme | **Minimal SPIFFS (1.9MB APP with OTA)** |
| Core Debug Level | None |
| Upload Speed | 921600 |

> El Partition Scheme se resetea al abrir otro sketch o reiniciar el IDE. Revisarlo **siempre** antes de subir; sin él, el OTA falla.

### 3.4 Estructura del sketch

```
ESP32_GDA_prueba_riego/
├── ESP32_GDA_prueba_riego.ino
└── secrets.h        ← obligatorio, en la misma carpeta
```

### 3.5 secrets.h (plantilla)

```cpp
// secrets.h
#ifndef SECRETS_H
#define SECRETS_H

#define WIFI_SSID_1  "nombre_red_1"
#define WIFI_PASS_1  "clave_red_1"

#define WIFI_SSID_2  "nombre_red_2"
#define WIFI_PASS_2  "clave_red_2"

#define WIFI_SSID_3  "nombre_red_3"
#define WIFI_PASS_3  "clave_red_3"

#define MQTT_USER    "usuario_hivemq"
#define MQTT_PASS    "clave_hivemq"

#define OTA_PASS     "clave_ota"

#endif
```

- Los nombres de red deben ser **exactos** (mayúsculas, espacios, guiones).
- El ESP32 solo se conecta a redes de **2,4 GHz**.
- `MQTT_USER` / `MQTT_PASS` deben coincidir con las credenciales creadas en HiveMQ Cloud (Access Management).
- **`secrets.h` nunca se sube al repositorio:** debe estar en `.gitignore`.
- En Windows, verificar que el archivo se llame `secrets.h` y no `secrets.h.txt` (activar Vista → Extensiones de nombre de archivo).

---

## 4. Carga del firmware

### 4.1 Primera carga (por USB)

Un ESP32 nuevo solo se puede cargar por cable.

1. Conectar con un cable USB **de datos** (no solo carga).
2. Si no aparece ningún puerto COM: instalar el driver del chip USB de la placa (**CP2102** o **CH340**, está impreso junto al conector).
3. Recomendado: desconectar el cable verde (AM2302, GPIO 15) durante la carga.
4. Herramientas → Puerto → COM correspondiente. Revisar Partition Scheme. **Subir**.
5. Si queda en `Connecting...`: mantener **BOOT**, presionar y soltar **EN/RST**, soltar BOOT.

### 4.2 Verificación

Monitor Serie a **115200 baudios**, presionar EN. Debe mostrar:

```
=== GDA prueba de riego ===
Buscando red....
Red:  <red conectada>
IP:   192.168.x.x
RSSI: -xx
mDNS: gda-nodo1.local
OTA listo
Telnet listo -> puerto 23
Conectando a HiveMQ...
MQTT OK
Suscrito a gda/prod/nodo1/comando
TX: {"maceta_id":1,"humedad":..,"bomba":false,...}
```

Anotar la IP para usar Telnet.

### 4.3 Cargas siguientes (OTA)

1. La PC debe estar en la misma red WiFi que el ESP32.
2. Herramientas → Puerto → Network ports → **gda-nodo1**.
3. Subir e ingresar la contraseña de `OTA_PASS`.

Después de un OTA el Monitor Serie no muestra nada: los logs se ven por **Telnet** a la IP del nodo, puerto **23** (PuTTY en Windows, tipo de conexión Telnet).

> Si se carga un sketch **sin** el bloque de OTA, la siguiente carga vuelve a requerir cable.

---

## 5. Lógica de riego

| Condición | Acción |
|---|---|
| Humedad **< 50 %** | Se prende la bomba |
| Humedad entre 50 % y 55 % | La bomba mantiene su estado |
| Humedad **> 55 %** | Se corta la bomba |

La diferencia entre 50 y 55 (histéresis) evita que el relé prenda y apague sin parar cuando la lectura oscila alrededor de un único umbral.

### 5.1 Protecciones

| Protección | Detalle |
|---|---|
| Tiempo máximo | Si la bomba lleva **2 min** prendida sin que la humedad supere 55 %, se corta y espera **1 min** antes de reintentar. Cubre sensor suelto, horquilla fuera de la tierra o tanque vacío. `BOMBA_MAX_ON_MS = 0` lo desactiva. |
| Arranque seguro | El relé se fija en apagado antes de configurar el pin, para evitar un pulso al bootear. |
| OTA | La bomba se apaga al iniciar una actualización. |
| Sin dependencia de red | El control de riego corre antes que WiFi/MQTT y sigue funcionando si se cae la conexión, incluso mientras reintenta MQTT. |

### 5.2 Parámetros configurables (sección RELE / BOMBA del código)

| Constante | Valor | Descripción |
|---|---|---|
| `PIN_RELE` | 26 | Pin de control del relé |
| `RELE_ACTIVO_BAJO` | `true` | Si la bomba funciona al revés, cambiar a `false` |
| `UMBRAL_ON` | 50 | % bajo el cual se prende |
| `UMBRAL_OFF` | 55 | % sobre el cual se corta |
| `BOMBA_MAX_ON_MS` | 120000 | Tiempo máximo encendida (ms) |
| `BOMBA_PAUSA_MS` | 60000 | Pausa tras un corte por tiempo (ms) |

### 5.3 Lectura del sensor

- Lectura cada **1 s**, promedio de 10 muestras (el FC-28 es ruidoso).
- ADC de 12 bits (0–4095), atenuación 11 dB (rango 0–3,3 V).
- En el FC-28, **valor crudo más alto = tierra más seca**; por eso el mapeo a porcentaje está invertido.

---

## 6. Calibración del FC-28

1. Agregar temporalmente en `leerHumedadSuelo()`, después de calcular `crudo`:
   ```cpp
   log("crudo=" + String(crudo));
   ```
2. Anotar el valor con la horquilla **al aire** (seco) y **sumergida en agua** (mojado).
3. Reemplazar en el código:
   ```cpp
   const int SUELO_SECO   = 3500;   // ← valor medido al aire
   const int SUELO_MOJADO = 1500;   // ← valor medido en agua
   ```
4. Quitar la línea de log y volver a subir.

---

## 7. MQTT

### 7.1 Tópicos

| Tópico | Dirección | Contenido |
|---|---|---|
| `gda/prod/nodo1/telemetria` | Nodo → broker, cada 5 s | Estado del nodo |
| `gda/prod/nodo1/evento` | Nodo → broker, en cada cambio de la bomba | Encendido/apagado y motivo |
| `gda/prod/nodo1/comando` | Broker → nodo | Suscrito; hoy solo se registran en el log |

### 7.2 Payloads

Telemetría:
```json
{"maceta_id":1,"humedad":42,"bomba":true,"rssi":-61,"ssid":"red","ip":"192.168.0.50","heap":215000}
```

Evento:
```json
{"maceta_id":1,"bomba":true,"humedad":48,"motivo":"humedad menor a 50"}
```

Motivos posibles: `humedad menor a 50`, `humedad mayor a 55`, `corte por tiempo maximo`.

### 7.3 Conexión

- Host: `fe6b7e466a1e43c7ba4a2cb5dcc50a39.s1.eu.hivemq.cloud`, puerto 8883.
- TLS con certificado raíz **ISRG Root X1** embebido en el código (vence en 2035).
- Client ID: `esp32-nodo1`.
- Para monitorear: **MQTT Explorer** con las mismas credenciales, suscribiendo a `gda/prod/#`.

---

## 8. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| `secrets.h: No such file or directory` | Falta `secrets.h` en la carpeta del sketch | Copiarlo junto al `.ino` y reabrir el sketch |
| No aparece puerto COM | Falta driver o cable solo de carga | Instalar driver CP2102/CH340, cambiar cable |
| Se queda en `Connecting...` | La placa no entra en modo carga | BOOT + EN (ver 4.1); desconectar GPIO 15 |
| No conecta al WiFi (puntos infinitos) | SSID/clave mal escritos o red de 5 GHz | Revisar `secrets.h`, usar red 2,4 GHz |
| `Fallo, rc=5` | Usuario/clave MQTT incorrectos | Verificar credenciales en HiveMQ |
| `Fallo, rc=-2` | Sin red al broker o problema de TLS | Revisar conexión a internet y certificado |
| No aparece `gda-nodo1` en Network ports | PC en otra red, o firmware sin OTA | Misma red; si no, cargar por USB |
| OTA falla al subir | Partition Scheme incorrecto | Minimal SPIFFS (1.9MB APP with OTA) |
| Bomba prendida cuando debería estar apagada | Relé activo en alto | `RELE_ACTIVO_BAJO = false` |
| Humedad siempre 0 % o 100 % | Sin calibrar, A0 mal conectado | Revisar cable amarillo a GPIO 34; calibrar (sección 6) |
| Bomba se corta antes de llegar a 55 % | Actuó el tiempo máximo | Acercar la horquilla a la salida de agua o subir `BOMBA_MAX_ON_MS` |
| Placa no arranca con todo conectado | GPIO 15 en estado incorrecto al bootear | Mover AM2302 a GPIO 4 |

---

## 9. Pendientes

- [ ] Calibrar `SUELO_SECO` y `SUELO_MOJADO` con el sensor real.
- [ ] Agregar lectura del AM2302 (GPIO 15) y publicar temperatura y humedad ambiente.
- [ ] Procesar comandos recibidos en `gda/prod/nodo1/comando` (riego manual, cambio de umbrales).
- [ ] Reemplazar la red 3 de `secrets.h` (placeholder) por la red real de la facultad.
