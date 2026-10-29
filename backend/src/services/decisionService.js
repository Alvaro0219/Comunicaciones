import { Event } from '../models/Event.js';
import { Alert } from '../models/Alert.js';
import { env } from '../config/env.js';
import { broadcast } from '../realtime/sseHub.js';
import { getForecast, rainExpected } from './weatherService.js';
import { raiseAlert, resolveAlerts } from './alertService.js';
import { triggerIrrigation } from './irrigationService.js';

// Tipos de evento que cuentan como "se regó (o se intentó regar) hace poco"
const IRRIGATION_TYPES = ['riego_activado', 'riego_calor', 'riego_manual'];

// ¿Hay un evento de alguno de estos tipos dentro de la ventana de espera (DECISION_COOLDOWN_MIN)?
async function recentEvent(potId, types) {
  if (env.decisionCooldownMin <= 0) return null;
  const since = new Date(Date.now() - env.decisionCooldownMin * 60 * 1000);
  return Event.findOne({ potId, type: { $in: types }, createdAt: { $gte: since } }).lean();
}

// Motor central de decisión de riego. Se ejecuta ante cada lectura válida y reciente.
//
// Con CONTROL_RIEGO=backend (el diseño del sistema) el nodo solo mide y ejecuta, y decide el
// backend (ver prompt funcional, sección 4):
//   - humedad < mínimo + lluvia próxima 6h  -> posponer + alerta preventiva
//   - humedad < mínimo sin lluvia           -> regar + alerta crítica
//   - humedad > máximo                      -> no regar + alerta exceso de humedad
//   - temperatura > umbral y humedad baja   -> riego breve + alerta calor extremo
// y toda decisión (incluida la de NO regar) queda registrada como evento.
//
// El nodo manda telemetría cada pocos segundos pero el suelo tarda minutos en reflejar el agua,
// así que hay una ESPERA (DECISION_COOLDOWN_MIN) entre riegos y entre registros repetidos de la
// misma decisión. Sin ella se regaría —y se registraría un evento— en cada lectura.
//
// Con CONTROL_RIEGO=nodo (solo compatibilidad con el sketch de prueba, que riega solo) el
// backend únicamente vigila: levanta y resuelve alertas, sin órdenes ni eventos de decisión.
export async function evaluateReading(pot, reading) {
  const soil = reading.soilMoisture;
  const temp = reading.temperature;
  const snapshot = { soilMoisture: soil, temperature: temp };
  const backendDecides = env.irrigationControl === 'backend';

  // Una zona interior no se moja: el pronóstico de lluvia no la afecta
  const considerRain = pot.exposure !== 'interior';

  let forecast = null;
  if (backendDecides && considerRain && pot.location?.lat != null && pot.location?.lon != null) {
    forecast = await getForecast(pot.location.lat, pot.location.lon);
  }

  // Se calcula una sola vez por lectura y solo si hace falta
  let coolingDown;
  const isCoolingDown = async () => {
    if (coolingDown === undefined) coolingDown = !!(await recentEvent(pot._id, IRRIGATION_TYPES));
    return coolingDown;
  };

  if (soil < pot.minMoisture) {
    // Si el suelo saltó de "demasiado húmedo" a "seco" sin pasar por el rango, esa alerta ya no aplica
    await resolveAlerts(pot, 'exceso_humedad');
    if (!backendDecides) {
      await raiseAlert(pot, 'critica',
        `Humedad baja (${soil}%) en "${pot.name}": por debajo del mínimo configurado (${pot.minMoisture}%)`,
        { soilMoisture: soil });
    } else {
      const { expected, maxProb } = considerRain
        ? rainExpected(forecast, 6, pot.rainProbThreshold)
        : { expected: false, maxProb: 0 };

      // La lluvia prevista nunca deja secar la planta: se riega igual si el suelo está en
      // emergencia o si la espera por lluvia ya duró demasiado (la alerta preventiva activa
      // marca desde cuándo se viene posponiendo; se resuelve sola al volver a rango).
      let motivo = considerRain ? 'sin lluvia prevista' : 'zona interior: no considera la lluvia';
      let reason = 'humedad_bajo_minimo';
      let rainBlocks = expected;
      if (expected) {
        const margin = pot.emergencyMarginPts ?? 10;
        const waitMs = (pot.maxPostponeHours ?? 6) * 60 * 60 * 1000;
        const postponing = await Alert.findOne({ potId: pot._id, type: 'preventiva', status: 'activa' }).lean();
        if (soil < pot.minMoisture - margin) {
          rainBlocks = false;
          reason = 'emergencia_humedad';
          motivo = `emergencia: ${Math.round((pot.minMoisture - soil) * 10) / 10} puntos bajo el mínimo, se riega aunque haya lluvia prevista`;
        } else if (postponing && Date.now() - new Date(postponing.createdAt).getTime() >= waitMs) {
          rainBlocks = false;
          reason = 'espera_lluvia_agotada';
          motivo = `llevaba más de ${pot.maxPostponeHours ?? 6} h esperando la lluvia prevista, se riega`;
        } else if (await isCoolingDown()) {
          // Se acaba de regar: no anunciar otra posposición mientras el suelo refleja el agua
          rainBlocks = false;
          motivo = 'lluvia prevista, pero se regó hace poco';
        }
      }

      if (rainBlocks) {
        if (!(await recentEvent(pot._id, ['riego_pospuesto']))) {
          const event = await Event.create({
            potId: pot._id,
            type: 'riego_pospuesto',
            origin: 'auto',
            result: 'no_aplica',
            message: `Riego pospuesto: lluvia prevista en las próximas 6h (prob. máx ${maxProb}%)`,
            detail: { reason: 'lluvia_prevista', rainProbability: maxProb, ...snapshot }
          });
          broadcast('event', { ...event.toObject(), potName: pot.name }, pot.ownerId);
        }
        await raiseAlert(pot, 'preventiva',
          `Humedad baja (${soil}%) en "${pot.name}", pero hay lluvia prevista: riego pospuesto`,
          { soilMoisture: soil, rainProbability: maxProb });
      } else {
        let note = 'riego activado';
        if (await isCoolingDown()) {
          note = 'esperando que haga efecto el riego reciente';
        } else {
          const result = await triggerIrrigation({
            pot,
            durationSec: pot.irrigationDurationSec,
            origin: 'auto',
            reason,
            readingSnapshot: snapshot
          });
          if (result.skipped) {
            note = { modo_lectura: 'riego omitido (modo lectura)', riego_en_curso: 'riego en curso' }[result.reason]
              || 'riego no emitido';
          }
        }
        // Ya no se pospone: la alerta preventiva (si había) deja de aplicar
        await resolveAlerts(pot, 'preventiva');
        await raiseAlert(pot, 'critica',
          `Humedad crítica (${soil}%) en "${pot.name}" (${motivo}): ${note}`,
          { soilMoisture: soil });
      }
    }
  } else if (soil > pot.maxMoisture) {
    // Lo mismo al revés: de "seco" a "demasiado húmedo" sin pasar por el rango
    await resolveAlerts(pot, ['critica', 'preventiva']);
    if (backendDecides && !(await recentEvent(pot._id, ['riego_no_aplicado']))) {
      const event = await Event.create({
        potId: pot._id,
        type: 'riego_no_aplicado',
        origin: 'auto',
        result: 'no_aplica',
        message: `No se riega: humedad (${soil}%) por encima del máximo configurado (${pot.maxMoisture}%)`,
        detail: { reason: 'exceso_humedad', ...snapshot }
      });
      broadcast('event', { ...event.toObject(), potName: pot.name }, pot.ownerId);
    }
    await raiseAlert(pot, 'exceso_humedad',
      `Exceso de humedad (${soil}%) en "${pot.name}": por encima del máximo configurado (${pot.maxMoisture}%)`,
      { soilMoisture: soil });
  } else {
    // Humedad dentro de rango: se resuelven las alertas de humedad que estuvieran activas
    await resolveAlerts(pot, ['critica', 'preventiva', 'exceso_humedad']);
  }

  // Regla de estrés por calor: temperatura alta + humedad baja (aunque no bajo el mínimo).
  // Solo aplica si el nodo reporta temperatura (el AM2302 puede no estar conectado aún).
  const soilIsLow = soil < pot.minMoisture + 10;
  if (temp != null && temp >= pot.heatTempThreshold && soilIsLow) {
    await raiseAlert(pot, 'calor_extremo',
      `Calor extremo (${temp}°C) con humedad baja (${soil}%) en "${pot.name}"${backendDecides ? ': riego breve preventivo' : ''}`,
      { temperature: temp, soilMoisture: soil });
    if (backendDecides && !(await isCoolingDown())) {
      // Si ya hay un riego en curso, triggerIrrigation lo omite solo (skipped)
      await triggerIrrigation({
        pot,
        durationSec: pot.heatIrrigationDurationSec,
        origin: 'calor',
        reason: 'estres_por_calor',
        readingSnapshot: snapshot
      });
    }
  } else if (temp != null && temp < pot.heatTempThreshold - 2) {
    await resolveAlerts(pot, 'calor_extremo');
  }
}
