# Probar todo en local con el broker de producción

Backend y frontend siguen corriendo **en desarrollo** (`npm run dev`, `NODE_ENV=development`, tu base de siempre). Lo único que cambia son las **variables MQTT**: el backend se conecta al HiveMQ con la credencial y el prefijo de producción. Así se valida, antes de Railway, que la credencial, los permisos y el prefijo funcionan de punta a punta.

```
tu PC (desarrollo)                         HiveMQ (producción)                  Nodo real
backend  ──── gda_backend, gda/prod ────►  broker  ◄──── gda_nodo1, gda/prod ──── ESP32 (gda-nodo-v2)
frontend ──► http://localhost:4000/api
```

## 1. Variables MQTT de producción en `backend/.env`

Solo estas líneas. El resto (`NODE_ENV`, `MONGO_URL`, secretos, `CORS_ORIGINS`) queda como está.

| Variable | Valor |
|---|---|
| `MQTT_HOST` / `MQTT_PORT` | El host de HiveMQ y `8883` (no cambian) |
| `MQTT_USER` / `MQTT_PASS` | La credencial de **producción** del backend (`gda_backend`, con Publish + Subscribe sobre `gda/prod/#`) |
| `MQTT_CLIENT_ID` | Uno propio y fijo, p. ej. `backend-alvaro` (Railway usará `backend-prod`) |
| `TOPIC_PREFIX` | `gda/prod` |
| `MODO_ESCRITURA` | **`false`** en la primera pasada |
| `CONTROL_RIEGO` | `backend` (es el default, no hace falta ponerlo) |
| `DECISION_COOLDOWN_MIN` | `10` (la espera real; en 1 solo para probar rápido) |

Reiniciá `npm run dev`: el `--watch` no relee el `.env`. El log tiene que decir:

```
Conectado a HiveMQ (backend-alvaro, prefijo gda/prod, escritura=false)
```

> Con `TOPIC_PREFIX=gda/prod` tu backend escucha al **nodo real**. Con `MODO_ESCRITURA=false` solo mira y registra: no puede activar la bomba.

## 2. Primero, sin el nodo: prueba automática contra el broker de producción

Valida que la credencial de producción tiene los permisos que hacen falta y que el prefijo funciona, **sin tocar la bomba real**. La prueba emula al nodo con un Node ID propio (`e2e-xxxx`) que el nodo físico no escucha.

Con el backend corriendo, en otra terminal:

```powershell
cd backend
$env:E2E_ADMIN_EMAIL="<un admin de tu base>"
$env:E2E_ADMIN_PASSWORD="<su contraseña>"
npm run e2e
```

Qué comprueba: la telemetría llega por el broker, la decisión automática, la espera entre riegos, el riego manual, el stream en vivo, los permisos por rol y el CORS. Hacé **dos pasadas**:

1. Con `MODO_ESCRITURA=false` → corre los chequeos de seguridad, de plataforma, de **modo lectura** (`L`) y de roles. Tiene que decir `TODO OK`.
2. Poné `MODO_ESCRITURA=true`, reiniciá el backend y repetí → corre los de **riego automático** (`A`) y **manual** (`M`) en lugar de los de lectura. `TODO OK` de nuevo.

Si `P2` falla ("la telemetría no llega"), la credencial no tiene permiso sobre `gda/prod/#` o el prefijo no coincide. Es justo lo que querés descubrir ahora y no en Railway.

La prueba deja una maceta eliminada y un usuario inactivo `e2e-*` en la base. Es inofensivo en desarrollo.

## 3. Después, con el nodo real (con Tomás)

Condiciones: el nodo corre `gda-nodo-v2` con `PREFIX = "gda/prod"` y la credencial `gda_nodo1` en su `secrets.h`, el sensor calibrado y el tanque con agua.

1. **Maceta:** en tu dashboard local, creá la maceta con Node ID **`nodo1`** (o usá la existente), con mínimo, máximo, duración de riego y ubicación.
2. **Con `MODO_ESCRITURA=false`:** la maceta tiene que pasar a online y mostrar la humedad real. Todavía no se riega.
3. **Con `MODO_ESCRITURA=true`:** avisale a Tomás y probá **"Regar ahora"** con 5 s. Tiene que sonar el relé y el evento quedar `confirmado` con la duración real.
4. **Automático:** que Tomás saque el sensor de la tierra para que baje del mínimo. Tiene que regar **una vez**, y esperar la espera configurada antes de la siguiente.

> **Con escritura en `true` sobre `gda/prod`, tu backend local riega la bomba real.** Solo puede haber **un** backend con escritura activa sobre ese prefijo: ni dos integrantes a la vez, ni tu local junto con el de Railway. Los demás se quedan en `gda/dev-nombre` o en `MODO_ESCRITURA=false`.

## 4. Al terminar

- **Volver a desarrollo normal:** `TOPIC_PREFIX=gda/dev-alvaro`, `MODO_ESCRITURA=false` (o `true` solo con tu simulador) y tu credencial personal.
- **Pasar a Railway:** las variables MQTT que acabás de validar son las definitivas. Se cargan igual en Railway, con `MQTT_CLIENT_ID=backend-prod` y `MODO_ESCRITURA=false` en el primer deploy. Apagá tu backend local antes de habilitar la escritura allá.

## Problemas frecuentes

| Síntoma | Causa |
|---|---|
| El backend se reconecta una y otra vez, o dice `Not authorized` | La credencial no tiene Publish/Subscribe sobre `gda/prod/#` |
| `P2` falla en la prueba automática | Prefijo distinto o credencial sin permisos; mirá el log del backend (`Error MQTT: ...`) |
| `S3` falla: login rechazado | El email o la contraseña no son los de un admin de la base de tu `.env`; con `429`, se agotaron los 10 intentos de login por 15 min |
| La maceta `nodo1` queda offline | La maceta no existe con Node ID `nodo1`, el nodo no publica en `gda/prod`, o tu `TOPIC_PREFIX` es otro |
| "Regar ahora" avisa modo lectura | `MODO_ESCRITURA` sigue en `false`, o no reiniciaste el backend |
| El nodo no riega aunque la orden salga | El nodo no corre `gda-nodo-v2` (el sketch de prueba ignora las órdenes) |
