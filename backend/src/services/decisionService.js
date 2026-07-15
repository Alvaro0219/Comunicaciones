import { Event } from '../models/Event.js';
import { broadcast } from '../realtime/sseHub.js';
import { getForecast, rainExpected } from './weatherService.js';
import { raiseAlert, resolveAlerts } from './alertService.js';
import { triggerIrrigation } from './irrigationService.js';

// Motor central de decisión de riego. Se ejecuta ante cada lectura válida y reciente.
// Reglas (ver prompt funcional, sección 4):
//   - humedad < mínimo + lluvia próxima 6h  -> posponer + alerta preventiva
//   - humedad < mínimo sin lluvia           -> regar + alerta crítica
//   - humedad > máximo                      -> no regar + alerta exceso de humedad
//   - temperatura > umbral y humedad baja   -> riego breve + alerta calor extremo
// Toda decisión (incluida la de NO regar) queda registrada como evento.
export async function evaluateReading(pot, reading) {
  const soil = reading.soilMoisture;
  const temp = reading.temperature;
  const snapshot = { soilMoisture: soil, temperature: temp };

  let forecast = null;
  if (pot.location?.lat != null && pot.location?.lon != null) {
    forecast = await getForecast(pot.location.lat, pot.location.lon);
  }

  if (soil < pot.minMoisture) {
    const { expected, maxProb } = rainExpected(forecast, 6, pot.rainProbThreshold);

    if (expected) {
      const event = await Event.create({
        potId: pot._id,
        type: 'riego_pospuesto',
        origin: 'auto',
        result: 'no_aplica',
        message: `Riego pospuesto: lluvia prevista en las próximas 6h (prob. máx ${maxProb}%)`,
        detail: { reason: 'lluvia_prevista', rainProbability: maxProb, ...snapshot }
      });
      broadcast('event', { ...event.toObject(), potName: pot.name }, pot.ownerId);
      await raiseAlert(pot, 'preventiva',
        `Humedad baja (${soil}%) en "${pot.name}", pero hay lluvia prevista: riego pospuesto`,
        { soilMoisture: soil, rainProbability: maxProb });
    } else {
      await triggerIrrigation({
        pot,
        durationSec: pot.irrigationDurationSec,
        origin: 'auto',
        reason: 'humedad_bajo_minimo',
        readingSnapshot: snapshot
      });
      await raiseAlert(pot, 'critica',
        `Humedad crítica (${soil}%) en "${pot.name}" sin lluvia prevista: riego activado`,
        { soilMoisture: soil });
    }
  } else if (soil > pot.maxMoisture) {
    const event = await Event.create({
      potId: pot._id,
      type: 'riego_no_aplicado',
      origin: 'auto',
      result: 'no_aplica',
      message: `No se riega: humedad (${soil}%) por encima del máximo configurado (${pot.maxMoisture}%)`,
      detail: { reason: 'exceso_humedad', ...snapshot }
    });
    broadcast('event', { ...event.toObject(), potName: pot.name }, pot.ownerId);
    await raiseAlert(pot, 'exceso_humedad',
      `Exceso de humedad (${soil}%) en "${pot.name}": riego inhibido`,
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
      `Calor extremo (${temp}°C) con humedad baja (${soil}%) en "${pot.name}": riego breve preventivo`,
      { temperature: temp, soilMoisture: soil });
    // Si ya hay un riego en curso, triggerIrrigation lo omite solo (skipped)
    await triggerIrrigation({
      pot,
      durationSec: pot.heatIrrigationDurationSec,
      origin: 'calor',
      reason: 'estres_por_calor',
      readingSnapshot: snapshot
    });
  } else if (temp != null && temp < pot.heatTempThreshold - 2) {
    await resolveAlerts(pot, 'calor_extremo');
  }
}
