# Guía práctica — Conectarse al sistema real (broker en la nube)

Esta guía explica cómo trabajar contra el sistema que ya está funcionando: el nodo ESP32 (lo tiene Tomás) publica su telemetría a **HiveMQ Cloud**, y cada integrante se conecta al broker desde su casa. Complementa dos documentos:

- [ESP32_CONNECTION_GUIDE.md](ESP32_CONNECTION_GUIDE.md) — el contrato exacto de topics y mensajes.
- [MAPA_DEL_SISTEMA.md](MAPA_DEL_SISTEMA.md) — referencia técnica completa: qué archivo y función procesa cada mensaje, de punta a punta.
- **"GDA Guia Setup" (documento interno del equipo)** — hosts, usuarios y contraseñas. **Las credenciales no van en este repo.**

---

## 1. Cómo está repartido el sistema

| Pieza | Dónde corre | Quién la maneja |
|---|---|---|
| Nodo ESP32 (`nodo1`) | Casa de Tomás. **Mide y ejecuta órdenes; no decide.** Publica a `gda/prod` | Tomás (único que hace OTA) |
| Broker MQTT | HiveMQ Cloud (TLS 8883) | Punto fijo, ya configurado |
| Backend + dashboard | Cada uno en local (este repo) → luego desplegado. **Decide el riego** (umbrales + pronóstico) | Todos |
| Simulador | Local, para desarrollar sin el nodo | Todos |

**Reglas del equipo (importan):**
- `MQTT_CLIENT_ID` **único por persona** — dos clientes con el mismo ID se desconectan mutuamente en loop y parece un problema de red.
- `TOPIC_PREFIX` **propio en desarrollo** (`gda/dev-alvaro`, `gda/dev-luquita`). `gda/prod` es solo del nodo real y del backend desplegado.
- `MODO_ESCRITURA=false` **siempre en local**: tu backend evalúa y registra la decisión, pero no publica órdenes. Sumado a que las cuentas personales son *Subscribe only* en HiveMQ, son dos capas que impiden activar la bomba real por accidente. Para regar (aun en pruebas) hace falta una credencial con Publish — ver 3.4.
- El firmware lo maneja quien tiene el hardware. El firmware del diseño está en [`firmware/gda-nodo-v2/`](../firmware/gda-nodo-v2/) (con `secrets.h.example`; el `secrets.h` real jamás se commitea). Ver la sección 5.

---

## 2. Paso 0 — Ver la telemetría real (MQTT Explorer)

Antes de tocar código, comprobá que llegás al broker:

1. Descargar e instalar [MQTT Explorer](https://mqtt-explorer.com).
2. Nueva conexión: **Host** = el host de HiveMQ (documento del equipo), **Port** = `8883`, **Username/Password** = tu credencial personal, y — el paso que todos fallan — activar el toggle **Encryption (tls)** (arriba a la derecha; la URL cambia sola a `mqtts://`). El desplegable Protocol se deja en `mqtt://`.
3. Conectar. Deberías ver el árbol `gda → prod → nodo1 → telemetria` actualizándose periódicamente con `humedad`, `bomba`, `rssi`, `ssid`, `ip` y `heap`.

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
CONTROL_RIEGO=backend                # el backend decide (default); ver ESP32_CONNECTION_GUIDE.md, sección 4
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

### 3.4 Cómo decide el sistema (y qué vas a ver)

**El nodo solo mide y ejecuta; el que decide es el backend** (`CONTROL_RIEGO=backend`, el default). Con `nodo1` publicando y la maceta registrada, en su detalle vas a ver:

- **Estado en vivo**: online, IP (para OTA/Telnet), señal WiFi con su calidad y RAM libre.
- **Humedad de suelo** (FC-28) actualizándose sin recargar, con la banda de umbrales y el gráfico de las últimas 24 h. **Temperatura y humedad del aire** (AM2302) en la tarjeta, en el detalle y en el gráfico. Si el sensor falla, esas métricas desaparecen en lugar de mostrar un dato inventado.
- **Riego automático**: cuando la humedad baja del **mínimo de la maceta** y no hay lluvia prevista en 6 h, el backend ordena regar. Ves el evento "Riego automático activado (5s)" en `pendiente`, la tarjeta pasa a "Regando…" y, cuando el nodo confirma que apagó la bomba, el evento queda `confirmado` con la duración real y se actualiza "Último riego". Si hay lluvia prevista se registra "Riego pospuesto" en lugar de regar.
- **Riego manual**: el botón **"Regar ahora"** ordena regar de inmediato (rol técnico o admin). Pasa por el mismo circuito de orden → ejecución → confirmación.
- **Espera entre riegos de 10 minutos** (`DECISION_COOLDOWN_MIN`): el suelo tarda en reflejar el agua, así que después de regar el backend no vuelve a regar automáticamente hasta pasada la espera (la alerta crítica sigue visible con el aviso). El riego manual no la respeta.
- **Alertas** según los umbrales de la maceta.

Los umbrales, la duración del riego y la ubicación (para el pronóstico) se configuran **por maceta en el dashboard**; el firmware no tiene reglas de riego.

> **Para que el backend pueda regar de verdad** hacen falta tres cosas: (1) una credencial de HiveMQ con permiso de **Publish** — las cuentas personales son *Subscribe only* y solo sirven para mirar; (2) `MODO_ESCRITURA=true`; (3) el mismo `TOPIC_PREFIX` que usa el nodo. En local con `MODO_ESCRITURA=false` (la regla del equipo) vas a ver las decisiones registradas como `[modo lectura] riego omitido` —una vez por ventana de espera— y el botón "Regar ahora" avisa que el backend está en modo lectura, pero no sale ninguna orden.

> **Probar el riego sin tocar producción:** poné el nodo y tu backend en un prefijo de desarrollo. En `gda-nodo-v2.ino` cambiá `PREFIX = "gda/dev-tunombre"`; en tu `.env`, `TOPIC_PREFIX=gda/dev-tunombre`, `MODO_ESCRITURA=true` y una credencial con publish. Así tu backend riega solo a tu nodo y no interfiere con `gda/prod`. Antes de dejarlo definitivo, volvé `PREFIX` a `gda/prod`.

---

## 4. Simulador (ya no es necesario para el flujo normal)

Con el nodo real publicando, el simulador deja de ser el camino principal. Sigue sirviendo para probar el ciclo de órdenes **sin hardware y sin riesgo**, con tu prefijo de desarrollo (`gda/dev-tunombre`, nunca `gda/prod`):

```bash
cd simulator
node index.js --host <HIVEMQ_HOST> --user gda_sim_tunombre --pass <PASS> --prefix gda/dev-tunombre
```

Se seca solo (~2 %/ciclo), publica cada 5 s, obedece `{"activar_riego":true}` y confirma. Usa el contrato anterior (`temp_ambiente`, `hum_ambiente`, confirma con `riego_exitoso`), que el backend sigue aceptando. Para que el backend le mande órdenes necesitás `MODO_ESCRITURA=true` y el mismo `TOPIC_PREFIX` en tu `.env`, además de una credencial con publish para ambos (el usuario personal es *Subscribe only* y no puede publicar la telemetría del simulador ni las órdenes).

---

## 5. El nodo físico

### Cableado

| Componente | Pin ESP32 | Nota |
|---|---|---|
| Sensor de humedad de suelo FC-28 — A0 | GPIO 34 | Solo entrada, ADC1 (sigue andando con WiFi). VCC a **3V3**, nunca a 5V |
| Módulo relé — IN | GPIO 26 | Alimentar el módulo desde 5V/VIN, no del 3V3. La bomba va por COM y NO con fuente propia, nunca del ESP32 |
| AM2302 / DHT22 — DATA | GPIO 15 | Lo lee `gda-nodo-v2` (v2.1). Pin de strapping: si la placa no bootea, moverlo a GPIO 4 **y cambiar `PIN_DHT` en el `.ino`**. Sensor pelado → pull-up 10k a VCC |

El conexionado completo con colores, las reglas y la calibración del sensor están en [GDA_Documentacion_Nodo1.md](GDA_Documentacion_Nodo1.md) (la mantiene Tomás); el cableado no cambia con el firmware nuevo (el AM2302 ya estaba conectado).

### Firmware: `gda-nodo-v2` ([`firmware/gda-nodo-v2/gda-nodo-v2.ino`](../firmware/gda-nodo-v2/gda-nodo-v2.ino))

**Mide y ejecuta, no decide.** No tiene reglas de riego propias.

- **Mide** la humedad del suelo (FC-28, promedio de 10 muestras, calibrada a 0–100 %) + la temperatura y humedad del aire (**AM2302**, GPIO 15) y **publica** todo en la telemetría cada `TELEMETRIA_MS` (30 s), la primera apenas conecta. El AM2302 se lee cada 5 s **en segundo plano**, sin frenar el riego, y se conserva la última lectura buena. Si el sensor falla o pasan 2 min sin una lectura buena, `temp_ambiente` y `hum_ambiente` se **omiten** (el backend lo toma como "sin dato"): nunca se manda un 0 ni un valor viejo.
- **Ejecuta** las órdenes de `.../comando`: enciende el relé `duracion_seg` segundos y lo apaga **por tiempo medido en el propio nodo** (si se cae la red a mitad del riego, la bomba igual se apaga). Acota la duración a 120 s (`DURACION_MAX_S`), ignora una orden si ya está regando, y `{"activar_riego":false}` apaga de inmediato.
- **Confirma** publicando un evento al encender y otro al apagar (con `commandId` y la duración real). Si no hay MQTT en ese momento, guarda el evento y lo reenvía al reconectar: sin el aviso de apagado el backend creería que la orden falló.
- **Seguridad**: relé apagado al arrancar y durante el OTA; sesión MQTT limpia (no entrega órdenes publicadas mientras estaba desconectado: regar tarde por una orden vieja es peor que no regar).
- **Conserva** WiFiMulti (3 redes), OTA (misma LAN) y Telnet (puerto 23) del sketch anterior. Los logs remotos salen por Telnet a la IP del nodo.

**Cómo cargarlo** (Arduino IDE 2.x, placa *ESP32 Dev Module*):

1. Librerías (Administrar bibliotecas): **PubSubClient** (Nick O'Leary), **ArduinoJson** (Benoit Blanchon, **v7.x**) y **DHT sensor library for ESPx** (beegee_tokyo). Es **la de ESPx** (`DHTesp.h`), no la de Adafruit: el sketch incluye `DHTesp.h`.
2. Copiar a la carpeta del sketch el `secrets.h` que ya usa Tomás (tiene exactamente los mismos nombres; hay un `secrets.h.example`).
3. Revisar en el `.ino`: `PREFIX` (`gda/prod` o tu prefijo de desarrollo, igual al `TOPIC_PREFIX` del backend) y **calibrar `SUELO_SECO` / `SUELO_MOJADO`** (el sketch imprime `crudo=…` en cada medición para eso; hoy son valores de ejemplo).
4. **Herramientas → Partition Scheme = Minimal SPIFFS (1.9MB APP with OTA)** — se resetea solo al reabrir el IDE, verificarlo siempre. Ocupa ~57 % de la flash.
5. Subir (OTA por *Network ports → gda-nodo1* si el nodo ya tiene un firmware con OTA, o por USB).

**Qué tenés que ver** en Telnet/Monitor Serie: `=== GDA nodo v2.1 (mide y ejecuta) ===` → `MQTT OK` → `Suscrito a gda/prod/nodo1/comando` → `crudo=…` y `TX: {"maceta_id":1,"humedad":…,"temp_ambiente":24.3,"hum_ambiente":61.5,"bomba":false,…}`. Si el AM2302 no responde, en su lugar aparece `AM2302: lectura invalida (…), revisar cableado en GPIO 15` y el `TX` sale sin esos dos campos. Al mandar una orden: `RX [.../comando]: {"activar_riego":true,…}` → `BOMBA ON por 5 s` → `EVENTO: {"bomba":true,…}` → 5 s después `BOMBA OFF tras 5 s` → `EVENTO: {"bomba":false,…,"duracion_seg":5}`.

> **El sketch de prueba anterior** (`ESP32_GDA_prueba_riego.ino`, en `firmware/gda-nodo/`) riega solo con una regla local de 50–55 % y no procesa comandos: sirvió para validar sensor, relé y bomba, pero **es lo contrario del diseño** y no debe usarse con el backend en modo `backend` (el nodo y el backend se pisarían). Si hay que usarlo, el backend debe correr con `CONTROL_RIEGO=nodo`.

### Estado del proyecto

| Ítem | Estado |
|---|---|
| Nodo publica a la nube desde cualquier red | ✅ Funcionando |
| OTA + Telnet (misma LAN) | ✅ Funcionando |
| Sensor de humedad de suelo + relé + bomba (hardware validado con el sketch de prueba) | ✅ |
| Firmware `gda-nodo-v2` (mide y ejecuta órdenes) | 🆕 Escrito y **compilado** para ESP32 Dev Module; falta cargarlo en el nodo y probarlo con la bomba |
| Backend decide (umbrales + pronóstico), riego manual, espera entre riegos, confirmación | ✅ Verificado con pruebas contra la base de datos |
| Credencial de HiveMQ con **Publish** para el backend | ⏳ Pendiente — sin ella el backend no puede mandar órdenes |
| Calibrar `SUELO_SECO` / `SUELO_MOJADO` | ⏳ Pendiente |
| Lectura del AM2302 (temperatura y humedad del aire) | 🆕 Escrita en `gda-nodo-v2` v2.1 y **compilada**; falta cargarla y probarla con el sensor. Backend y dashboard ya la procesan (verificado con pruebas): la temperatura alimenta la regla de calor extremo |
| Buffer offline (RNF4) | ⏳ Pendiente (el backend ya acepta `measuredAt`/`source:"replay"` para cuando exista) |

---

## 6. Diagnóstico rápido

| Síntoma | Causa | Solución |
|---|---|---|
| MQTT Explorer: `Disconnected from server` | Toggle **Encryption (tls)** apagado | Activarlo — el 8883 solo habla TLS |
| Backend: `Error MQTT: ...` con rc/razón `Not authorized` | Publicar sin permiso (cuenta *Subscribe only*) o topic fuera de tu prefijo | Usar credencial `gda_sim_*` para publicar; revisar `TOPIC_PREFIX` |
| Backend: reconexiones constantes | Dos clientes con el mismo `MQTT_CLIENT_ID` | Cambiar el tuyo en `.env` |
| Backend conecta pero el dashboard no muestra nada | No hay maceta con ese Node ID, o prefijos distintos entre simulador y backend | Crear maceta `nodo1`; mismo `TOPIC_PREFIX` en ambos |
| El motor "no riega" en local | Comportamiento esperado | `MODO_ESCRITURA=false`: mirá el evento `[modo lectura]` en el historial |
| El nodo está online pero el dashboard dice "Sin lecturas todavía" | Las lecturas llegan como `invalida` (humedad fuera de 0–100, p. ej. sin calibrar) o el nodo no manda `humedad` | Historial → pestaña **Lecturas**: si hay filas `invalida`, revisar la calibración (`SUELO_SECO`/`SUELO_MOJADO`) |
| El dashboard no muestra temperatura ni humedad del aire | El AM2302 no responde: el log del nodo dice `AM2302: lectura invalida` | Revisar el cable de DATA a GPIO 15, VCC a 3V3, GND y la resistencia de 10 kΩ si el sensor es de 4 patas. Si el sensor está desconectado el sistema sigue regando por humedad de suelo |
| La placa no arranca o no carga el firmware con el AM2302 conectado | GPIO 15 es un pin de arranque | Desconectar el cable verde al cargar, o mover DATA a GPIO 4 y cambiar `PIN_DHT` |
| Humedad siempre 0 % o 100 % | FC-28 sin calibrar o A0 mal conectado | Calibrar con el log `crudo=…` (sección 6 de la documentación del nodo); revisar el cable a GPIO 34 |
| "Regar ahora" avisa que el backend está en modo lectura (`READ_ONLY`) | `MODO_ESCRITURA=false` en tu `.env` | Esperado en local. Para regar: credencial con Publish + `MODO_ESCRITURA=true` (ver 3.4) |
| "Regar ahora" dice `NODE_NO_COMMANDS` | El backend corre con `CONTROL_RIEGO=nodo` | Dejar el default `backend` (el modo `nodo` es solo para el sketch de prueba) |
| Se mandó una orden pero la bomba no se movió y el evento queda `fallido` ("sin confirmación") | El nodo no recibió la orden o corre un firmware sin comandos | Verificar que el nodo corra `gda-nodo-v2`, que su `PREFIX` sea igual al `TOPIC_PREFIX` del backend, y que en el log aparezca `RX [.../comando]` |
| El backend no publica y se reconecta una y otra vez | La credencial del backend no tiene permiso de Publish (HiveMQ rechaza el publish y corta la conexión) | Usar una credencial con Publish (`gda_backend` o una de desarrollo) |
| La bomba se enciende sola, sin orden | El nodo corre el sketch de prueba (regla local 50–55 %) | Cargar `gda-nodo-v2`. El backend lo muestra como un riego `source:"nodo"` en el historial |
| El backend riega y la humedad no sube | Sensor fuera de la tierra, manguera desconectada o tanque vacío | Revisar el hardware; el backend espera 10 min entre riegos automáticos, así que no encharca |
| Bomba prendida cuando debería estar apagada (y viceversa) | Relé activo en alto | `RELE_ACTIVO_BAJO = false` en el firmware |
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
