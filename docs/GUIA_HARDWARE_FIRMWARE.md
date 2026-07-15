# Guía práctica — Conectarse al sistema real (broker en la nube)

Esta guía explica cómo trabajar contra el sistema que ya está funcionando: el nodo ESP32 (lo tiene Tomás) publica su telemetría a **HiveMQ Cloud**, y cada integrante se conecta al broker desde su casa. Complementa dos documentos:

- [ESP32_CONNECTION_GUIDE.md](ESP32_CONNECTION_GUIDE.md) — el contrato exacto de topics y mensajes.
- **"GDA Guia Setup" (documento interno del equipo)** — hosts, usuarios y contraseñas. **Las credenciales no van en este repo.**

---

## 1. Cómo está repartido el sistema

| Pieza | Dónde corre | Quién la maneja |
|---|---|---|
| Nodo ESP32 (`nodo1`) | Casa de Tomás, publica cada 5s a `gda/prod` | Tomás (único que hace OTA) |
| Broker MQTT | HiveMQ Cloud (TLS 8883) | Punto fijo, ya configurado |
| Backend + dashboard | Cada uno en local (este repo) → luego desplegado | Todos |
| Simulador | Local, para desarrollar sin el nodo | Todos |

**Reglas del equipo (importan):**
- `MQTT_CLIENT_ID` **único por persona** — dos clientes con el mismo ID se desconectan mutuamente en loop y parece un problema de red.
- `TOPIC_PREFIX` **propio en desarrollo** (`gda/dev-alvaro`, `gda/dev-luquita`). `gda/prod` es solo del nodo real y del backend desplegado.
- `MODO_ESCRITURA=false` **siempre en local**: tu backend evalúa y loguea, pero no publica comandos. Sumado a que las cuentas personales son *Subscribe only* en HiveMQ, son dos capas que impiden activar la bomba real por accidente.
- El firmware lo maneja quien tiene el hardware. La copia de referencia está en [`firmware/gda-nodo/`](../firmware/gda-nodo/) (con `secrets.h.example`; el `secrets.h` real jamás se commitea).

---

## 2. Paso 0 — Ver la telemetría real (MQTT Explorer)

Antes de tocar código, comprobá que llegás al broker:

1. Descargar e instalar [MQTT Explorer](https://mqtt-explorer.com).
2. Nueva conexión: **Host** = el host de HiveMQ (documento del equipo), **Port** = `8883`, **Username/Password** = tu credencial personal, y — el paso que todos fallan — activar el toggle **Encryption (tls)** (arriba a la derecha; la URL cambia sola a `mqtts://`). El desplegable Protocol se deja en `mqtt://`.
3. Conectar. Deberías ver el árbol `gda → prod → nodo1 → telemetria` actualizándose cada 5 segundos con `rssi`, `ssid`, `ip` y `heap`.

Si ves eso, ya estás conectado al sistema real. Si dice `Disconnected from server`, el toggle TLS está apagado.

---

## 3. Backend local contra el broker

### 3.1 Configurar `.env`

En `backend/.env` (copiar de `.env.example` si no existe), sección MQTT:

```env
MQTT_HOST=<host de HiveMQ, del documento del equipo>
MQTT_PORT=8883
MQTT_USER=<tu usuario personal>
MQTT_PASS=<tu contraseña>
MQTT_CLIENT_ID=backend-tunombre      # único por persona
TOPIC_PREFIX=gda/dev-tunombre        # tu prefijo de desarrollo
MODO_ESCRITURA=false                 # siempre false en local
```

### 3.2 Levantar y verificar

```bash
cd backend && npm run dev
```

En el log tiene que aparecer:

```
Conectado a HiveMQ (backend-tunombre, prefijo gda/dev-tunombre, escritura=false)
```

### 3.3 Registrar la maceta

El backend asocia los mensajes a macetas por el **Node ID** del topic. En el dashboard: Macetas → Nueva maceta → Node ID = `nodo1` (el mismo que publica el firmware/simulador). Sin esa maceta, el backend loguea `Telemetría de nodo no registrado` y descarta los mensajes.

### 3.4 Mirar el nodo real (opcional, solo lectura)

Cambiando `TOPIC_PREFIX=gda/prod` tu backend consume la telemetría del nodo verdadero: vas a ver su estado online, IP, señal WiFi y RAM en el detalle de la maceta. Con `MODO_ESCRITURA=false` + cuenta *Subscribe only* no podés interferir. Volvé a tu prefijo para desarrollar.

---

## 4. Desarrollar sin el nodo: el simulador

El simulador habla el mismo contrato que el firmware (el backend no distingue):

```bash
cd simulator
node index.js --host <HIVEMQ_HOST> --user gda_sim_tunombre --pass <PASS> --prefix gda/dev-tunombre
```

Se seca solo (~2%/ciclo), publica cada 5s, obedece `{"activar_riego":true}` y confirma con `riego_exitoso`.

> **Ojo con el permiso**: tu usuario personal es *Subscribe only* y **no puede publicar** la telemetría del simulador. Hace falta una credencial con publish restringida a tu prefijo (`gda_sim_tunombre`) — pedirla a quien administra HiveMQ, como indica el documento del equipo.

Flujo típico de desarrollo (dos terminales + dashboard):

```
node simulator/index.js --host ... --prefix gda/dev-tunombre   # terminal 1
cd backend && npm run dev                                      # terminal 2
cd frontend && npm run dev                                     # terminal 3
```

En el dashboard: la maceta `nodo1` pasa a online, la humedad baja ciclo a ciclo, y cuando cruza el umbral mínimo vas a ver el evento `[modo lectura] riego omitido: MODO_ESCRITURA=false` — el motor decidió regar pero la guardia local lo frenó, que es exactamente el comportamiento esperado en desarrollo.

---

## 5. El nodo físico (resumen — el detalle lo tiene Tomás)

### Cableado actual

| Componente | Pin ESP32 | Nota |
|---|---|---|
| AM2302 / DHT22 — DATA | GPIO 15 | Pin de strapping: si la placa no bootea, moverlo a GPIO 4. Sensor pelado → pull-up 10k a VCC |
| Sensor capacitivo de suelo | GPIO 34 | Solo entrada, sin pull-up interno |
| Módulo relé — IN | GPIO 26 | Alimentar el módulo desde 5V, no del 3V3 |

### Particularidades del firmware ([`firmware/gda-nodo/`](../firmware/gda-nodo/))

- **WiFiMulti**: tres redes precargadas en `secrets.h`; el nodo salta a la que encuentre. Por eso su IP cambia — y por eso la publica en la telemetría.
- **OTA** (actualización sin cable): solo desde la **misma LAN** que el nodo. Arduino IDE → Puerto → Network ports → `gda-nodo1`, contraseña OTA del documento del equipo. Requiere **Partition Scheme = Minimal SPIFFS** (se resetea solo al reabrir el IDE — verificarlo antes de cada subida).
- **Logs remotos**: Telnet al puerto 23 de la IP del nodo (la IP sale de la telemetría). El Monitor Serie no funciona sobre el puerto de red.
- Librería DHT del proyecto: **DHT sensor library for ESPx (beegee_tokyo)** — la de Adafruit no compila con este sketch.

### Estado del proyecto (según el documento del equipo)

| Ítem | Estado |
|---|---|
| Nodo publica a la nube desde cualquier red | ✅ Funcionando |
| OTA + Telnet (misma LAN) | ✅ Funcionando |
| Sensores físicos (AM2302, capacitivo) | ⏳ Pendiente |
| Backend consumiendo MQTT | ✅ Este repo ya lo hace |
| Buffer offline en SPIFFS (RNF4) | ⏳ Pendiente (el backend ya acepta `measuredAt`/`source:"replay"` para cuando exista) |

---

## 6. Diagnóstico rápido

| Síntoma | Causa | Solución |
|---|---|---|
| MQTT Explorer: `Disconnected from server` | Toggle **Encryption (tls)** apagado | Activarlo — el 8883 solo habla TLS |
| Backend: `Error MQTT: ...` con rc/razón `Not authorized` | Publicar sin permiso (cuenta *Subscribe only*) o topic fuera de tu prefijo | Usar credencial `gda_sim_*` para publicar; revisar `TOPIC_PREFIX` |
| Backend: reconexiones constantes | Dos clientes con el mismo `MQTT_CLIENT_ID` | Cambiar el tuyo en `.env` |
| Backend conecta pero el dashboard no muestra nada | No hay maceta con ese Node ID, o prefijos distintos entre simulador y backend | Crear maceta `nodo1`; mismo `TOPIC_PREFIX` en ambos |
| El motor "no riega" en local | Comportamiento esperado | `MODO_ESCRITURA=false`: mirá el evento `[modo lectura]` en el historial |
| Nodo (firmware) `rc=-2` | Fallo TLS | Certificado `CA_CERT` mal pegado |
| Nodo `rc=4` / `rc=5` | Credencial inválida / sin permiso para ese topic | Revisar `secrets.h` |
| OTA: `No response from device` | Partition Scheme incorrecto | `Minimal SPIFFS` + una subida por cable |
| `heap` bajando sostenido | Memory leak en el firmware | Con TLS lo sano ronda 170–190 KB |

### Interpretar el RSSI (visible en el detalle de la maceta)

| Valor | Calidad | Consecuencia |
|---|---|---|
| −30 a −60 | Excelente | OTA rápido y confiable |
| −60 a −70 | Buena | Sin problemas |
| −70 a −80 | Justa | El OTA puede cortarse |
| −80 a −90 | Muy débil | Desconexiones frecuentes |
