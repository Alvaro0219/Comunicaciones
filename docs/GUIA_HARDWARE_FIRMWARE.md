# Guía completa — Del cableado al dashboard (ESP32 + FC-28 + AM2302 + Relé)

Esta guía te lleva paso a paso desde el hardware desconectado hasta ver la telemetría real de tu ESP32 en el dashboard de GDA. El firmware ya está escrito en [`firmware/gda_node/`](../firmware/gda_node/): **el único archivo que vas a editar es `config.h`**.

**Hardware cubierto por esta guía:**

| Componente | Modelo | Rol |
|---|---|---|
| Microcontrolador | ESP32-WROOM-32 (DevKit) | Cerebro del nodo |
| Humedad de suelo | FC-28 (salida analógica AO) | Sensor principal de riego |
| Temperatura y humedad del aire | ASAIR AM2302 (= DHT22 con cable) | Condiciones ambiente |
| Actuador | Módulo de relé 5V (1 canal) | Enciende la bomba/válvula |

> El contrato de mensajes MQTT (formato exacto de telemetría, comandos y acks) está en [ESP32_CONNECTION_GUIDE.md](ESP32_CONNECTION_GUIDE.md). Esta guía es la parte práctica: cableado, firmware y puesta en marcha.

---

## 1. Cableado

### 1.1 FC-28 (humedad de suelo)

El FC-28 viene en dos partes: la horquilla (electrodos) y la plaquita comparadora. Conectá la horquilla a la plaquita con los dos cables que trae, y la plaquita al ESP32:

| Pin FC-28 | Pin ESP32 | Nota |
|---|---|---|
| VCC | **3V3** | ⚠️ A 3.3V, NO a 5V: la salida AO debe quedar dentro del rango del ADC |
| GND | GND | |
| **AO** | **GPIO 34** | Salida analógica. GPIO34 es ADC1 y es solo-entrada, ideal para sensores |
| DO | — sin conectar | La salida digital no se usa (el umbral lo decide el backend) |

> ⚠️ **Regla de oro del ESP32**: cuando el WiFi está activo, los pines de **ADC2 no funcionan** para lecturas analógicas. Usá siempre GPIO 32–39 (ADC1) para el FC-28. Por eso la guía usa el 34.

### 1.2 AM2302 (temperatura y humedad del aire)

El AM2302 es un DHT22 encapsulado con cable. Tiene 3 hilos:

| Cable AM2302 | Pin ESP32 | Nota |
|---|---|---|
| Rojo (VCC) | 3V3 | Funciona a 3.3–5V; a 3.3V la señal queda en niveles seguros |
| Negro (GND) | GND | |
| Amarillo (DATA) | **GPIO 4** | Si tu módulo NO trae placa con resistencia, poné una de **10 kΩ entre DATA y 3V3** (pull-up) |

### 1.3 Módulo de relé 5V

| Pin relé | Conexión | Nota |
|---|---|---|
| VCC | **VIN** del ESP32 | VIN entrega los 5V del USB; la bobina del relé necesita 5V |
| GND | GND | |
| IN | **GPIO 26** | Señal de control |

**Lado de potencia del relé (la bomba):** la bomba NUNCA se alimenta del ESP32. Usá su propia fuente:

```
Fuente de la bomba (+) ──► COM (relé)
NO (relé) ──► Bomba (+)
Bomba (−) ──► Fuente de la bomba (−)
```

Se usa el contacto **NO** (normalmente abierto): con el sistema apagado, la bomba queda apagada.

> La mayoría de estos módulos son **activos en LOW** (el relé cierra cuando IN va a 0V). El firmware ya lo asume (`RELAY_ACTIVE_LOW true` en `config.h`). Si al probar la bomba queda prendida en reposo y se apaga al regar, cambialo a `false`.

### 1.4 Esquema general

```
                        ESP32-WROOM-32
                       ┌───────────────┐
   FC-28 AO ──────────►│ GPIO34    3V3 │◄──── VCC FC-28 y AM2302
   AM2302 DATA ───────►│ GPIO4     VIN │────► VCC relé (5V)
   Relé IN ◄───────────│ GPIO26    GND │◄──── GND común (todos)
                       └───────────────┘
                                │ USB
                                ▼
                        PC / cargador 5V
```

**Checklist antes de energizar:** GND común entre ESP32, FC-28, AM2302 y relé · FC-28 a 3.3V · bomba con fuente propia por COM/NO · nada conectado a GPIO 6-11 (flash interno).

---

## 2. Preparar el backend (5 minutos)

1. **Levantá el sistema**: `npm run dev` en `backend/` y en `frontend/`.
2. **Creá la maceta del nodo**: dashboard → Macetas → **Nueva maceta**. Elegí el `nodeId` (ej. `maceta-01`), umbrales y ubicación. Al guardar aparece el diálogo **"Credenciales del nodo"**: copiá el **Node ID** y el **Device Token** (también quedan visibles en el detalle de la maceta).
3. **Averiguá la IP local de tu PC** (el ESP32 tiene que poder llegar al broker):
   ```powershell
   ipconfig
   ```
   Buscá "Dirección IPv4" del adaptador WiFi/Ethernet (ej. `192.168.1.100`). El ESP32 debe estar en **la misma red**.
4. **Abrí el puerto 1883 en el firewall de Windows** (una sola vez, PowerShell como administrador):
   ```powershell
   New-NetFirewallRule -DisplayName "GDA MQTT" -Direction Inbound -Protocol TCP -LocalPort 1883 -Action Allow
   ```
5. (Opcional) Verificá desde otra máquina de la red: `Test-NetConnection 192.168.1.100 -Port 1883` debe dar `TcpTestSucceeded: True` con el backend corriendo.

---

## 3. Preparar el Arduino IDE (una sola vez)

1. Instalá [Arduino IDE 2.x](https://www.arduino.cc/en/software).
2. **Soporte ESP32**: File → Preferences → *Additional boards manager URLs*, agregá:
   ```
   https://espressif.github.io/arduino-esp32/package_esp32_index.json
   ```
   Después: Tools → Board → Boards Manager → buscar **esp32** (by Espressif Systems) → Install.
3. **Librerías** (Tools → Manage Libraries, instalar estas cuatro):
   | Librería | Autor |
   |---|---|
   | **PubSubClient** | Nick O'Leary |
   | **ArduinoJson** | Benoit Blanchon (v7) |
   | **DHT sensor library** | Adafruit |
   | **Adafruit Unified Sensor** | Adafruit (dependencia de la anterior) |
4. Conectá el ESP32 por USB y seleccioná: Tools → Board → **ESP32 Dev Module**, y el puerto COM que aparezca. Si no aparece ningún COM, instalá el driver USB-serial de tu placa (CP210x o CH340, según el chip que tenga al lado del conector USB).

---

## 4. Configurar el firmware

Abrí `GDA/firmware/gda_node/gda_node.ino` con el Arduino IDE (va a abrir también `config.h` en una pestaña). **Editá solo `config.h`**:

| Constante | Qué poner |
|---|---|
| `WIFI_SSID` / `WIFI_PASSWORD` | Tu red WiFi de **2.4 GHz** (el ESP32 no ve redes de 5 GHz) |
| `MQTT_HOST` | La IP de tu PC del paso 2.3 (ej. `"192.168.1.100"`) |
| `MQTT_PORT` | `1883` (dejalo así en local) |
| `NODE_ID` | El Node ID de la maceta creada en el paso 2.2 |
| `DEVICE_TOKEN` | El Device Token del mismo diálogo (es la contraseña MQTT) |
| `TELEMETRY_INTERVAL_S` | `30` para probar; `600` (10 min) en producción |

Los pines (`PIN_SOIL 34`, `PIN_DHT 4`, `PIN_RELAY 26`) ya coinciden con el cableado de la sección 1 — no los toques salvo que hayas cableado distinto.

---

## 5. Cargar y ver la primera conexión

1. **Upload** (flecha →). Si la carga falla con "Failed to connect", mantené apretado el botón **BOOT** de la placa cuando el IDE dice "Connecting...".
2. Abrí el **Monitor Serie** (Tools → Serial Monitor) a **115200 baud**. Deberías ver esta secuencia:
   ```
   === Nodo GDA — maceta-01 ===
   [wifi] conectando a TU_RED_WIFI.....
   [wifi] conectado, IP 192.168.1.57
   [ntp] sincronizando reloj.... ok
   [mqtt] conectando a 192.168.1.100:1883 como maceta-01... ok
   [telemetria] suelo 42.3% (raw 2456) | 24.1 C | aire 61.0%
   ```
3. **En el dashboard, al mismo tiempo**: la maceta pasa a **online** (punto verde pulsando) y en ~30 s aparece la primera lectura en la tarjeta, con el marcador de la banda de humedad posicionado — sin recargar la página.

Si algo de esa secuencia falla, saltá a la sección 8 (diagnóstico).

---

## 6. Calibrar el FC-28 (importante para que los % tengan sentido)

El FC-28 no entrega porcentaje: entrega una tensión que depende del sensor, del suelo y hasta de la oxidación. El firmware imprime la lectura cruda (`raw`) en cada telemetría para que calibres los dos extremos:

1. **Extremo seco**: con la horquilla **al aire** (limpia y seca), mirá el monitor serie y anotá el `raw` (típico: 3200–4095).
2. **Extremo húmedo**: meté la horquilla en un **vaso con agua** (hasta la línea de los electrodos, sin mojar la plaquita) y anotá el `raw` (típico: 1200–1800).
3. Poné esos dos valores en `config.h`:
   ```cpp
   #define SOIL_RAW_AIR   3650   // tu lectura al aire
   #define SOIL_RAW_WATER 1420   // tu lectura en agua
   ```
4. Volvé a cargar el firmware. Ahora 0% ≈ seco total y 100% ≈ saturado, y los umbrales configurados en el dashboard trabajan sobre valores reales.

> Consejo de vida útil: el FC-28 resistivo se oxida con el tiempo. Si en unos meses ves lecturas corridas, recalibrá (o considerá migrar a un sensor capacitivo — mismo cableado AO/ADC1, solo cambia la calibración).

---

## 7. Probar el circuito completo de riego

1. En el dashboard, con la maceta online, tocá **"Regar ahora"** (rol técnico o admin).
2. En el monitor serie: `[cmd] orden de riego recibida: 5 s` → escuchás el **clic** del relé → 5 segundos → clic de apagado → `[ack] ... -> ok`.
3. En el dashboard: la tarjeta muestra "Regando…" con la animación y, al terminar, el evento **Riego manual → confirmado** en el detalle de la maceta, con "Último riego" actualizado.
4. **Prueba del motor automático**: sacá la horquilla del suelo (humedad cae bajo el mínimo) y esperá el próximo ciclo de telemetría: el sistema decide solo, riega (si no hay lluvia prevista) y registra el evento como `riego_activado`.
5. **Prueba de tolerancia a cortes**: apagá el router WiFi 2–3 minutos. El monitor serie va a mostrar `[buffer] lectura almacenada offline`; el dashboard marca el nodo offline (y a los 15 min saltaría la alerta de fallo de sensor). Al volver el WiFi: `[buffer] retransmitiendo N lectura(s)` y esas lecturas aparecen en el historial como `retransmitida`, sin duplicados.

Cuando todo funcione, poné `TELEMETRY_INTERVAL_S 600` y recargá: ese es el ciclo de producción.

---

## 8. Diagnóstico rápido

| Síntoma (monitor serie) | Causa probable | Solución |
|---|---|---|
| `[wifi] sin conexion` | Red de 5 GHz, o SSID/password mal | El ESP32 solo ve 2.4 GHz; revisá credenciales |
| `[mqtt] fallo (rc=-2)` | No llega al host | ¿Backend corriendo? ¿`MQTT_HOST` es la IP correcta? ¿Firewall 1883 abierto (paso 2.4)? ¿Misma red? |
| `[mqtt] fallo (rc=4)` o `(rc=5)` | Credenciales rechazadas | `NODE_ID`/`DEVICE_TOKEN` no coinciden con la maceta, o la maceta está inactiva/eliminada |
| `[dht] lectura invalida (NaN)` | Cableado del AM2302 | Revisá DATA en GPIO4, pull-up de 10 kΩ si no tiene placa, y esperá ~2 s tras encender |
| `soil raw` clavado en 4095 | FC-28 sin señal | AO desconectado, o horquilla sin conectar a la plaquita |
| `soil raw` clavado en 0 | Cortocircuito o AO a GND | Revisá el cableado del FC-28 |
| Humedad siempre 0% o 100% | Calibración invertida o sin hacer | Repetí la sección 6; `SOIL_RAW_AIR` debe ser **mayor** que `SOIL_RAW_WATER` |
| Bomba prendida en reposo | Relé activo-alto | `RELAY_ACTIVE_LOW false` en `config.h` |
| `[ntp] sin exito` | La red bloquea NTP | Probá otro `NTP_SERVER` (ej. `time.google.com`); sin reloj no se envía telemetría |
| Conecta pero el dashboard no muestra datos | Telemetría rechazada | Mirá la consola del backend: avisa `Telemetría malformada/rechazada` con el motivo |
| Nodo aparece y desaparece | Alimentación insuficiente | Usá un puerto/cargador USB de 1A+; los picos de WiFi + relé resetean la placa con mala alimentación |

**Para aislar problemas**: si el simulador (`simulator/`) conecta con las mismas credenciales desde tu PC y el ESP32 no, el problema está en la red/firmware del ESP32, no en el servidor.

---

## 9. Cuando pases a producción (Railway)

El único cambio en el firmware es `config.h`: `MQTT_HOST` y `MQTT_PORT` pasan a ser el host y puerto del **TCP Proxy** de Railway (ver [ESP32_CONNECTION_GUIDE.md](ESP32_CONNECTION_GUIDE.md), sección 6). El resto —credenciales, topics, formato— es idéntico.
