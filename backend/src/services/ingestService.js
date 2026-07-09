import Joi from 'joi';
import { Pot } from '../models/Pot.js';
import { Reading } from '../models/Reading.js';
import { broadcast } from '../realtime/sseHub.js';
import { resolveAlerts } from './alertService.js';
import { evaluateReading } from './decisionService.js';

// Estructura mínima que debe tener un mensaje de telemetría MQTT
const telemetrySchema = Joi.object({
  soilMoisture: Joi.number().required(),
  temperature: Joi.number().required(),
  airHumidity: Joi.number().required(),
  measuredAt: Joi.number().integer().required(), // epoch en segundos (NTP en el ESP32)
  source: Joi.string().valid('live', 'replay').default('live')
});

// Rangos físicamente posibles: fuera de esto la lectura se guarda marcada como inválida
function rangeErrors({ soilMoisture, temperature, airHumidity }) {
  const errors = [];
  if (soilMoisture < 0 || soilMoisture > 100) errors.push('humedad de suelo fuera de 0-100%');
  if (airHumidity < 0 || airHumidity > 100) errors.push('humedad de aire fuera de 0-100%');
  if (temperature < -40 || temperature > 80) errors.push('temperatura fuera de -40..80°C');
  return errors;
}

export async function handleTelemetry(nodeId, raw) {
  const pot = await Pot.findOne({ nodeId, isActive: true });
  if (!pot) {
    console.warn(`Telemetría rechazada: nodo no registrado o inactivo (${nodeId})`);
    return;
  }

  const { error, value } = telemetrySchema.validate(raw, { stripUnknown: true });
  if (error) {
    console.warn(`Telemetría malformada de ${nodeId}: ${error.message}`);
    return;
  }

  const errors = rangeErrors(value);
  const measuredAt = new Date(value.measuredAt * 1000);

  let reading;
  try {
    reading = await Reading.create({
      potId: pot._id,
      nodeId,
      soilMoisture: value.soilMoisture,
      temperature: value.temperature,
      airHumidity: value.airHumidity,
      measuredAt,
      source: value.source,
      status: errors.length ? 'invalida' : 'valida',
      invalidReason: errors.join('; ') || undefined
    });
  } catch (err) {
    if (err.code === 11000) return; // retransmisión duplicada: ya la tenemos, no se duplica
    throw err;
  }

  // Actualizar snapshot de la maceta (solo si esta lectura es más nueva que la última)
  const update = { lastSeenAt: new Date(), online: true };
  const isNewer = !pot.lastReading?.measuredAt || measuredAt > pot.lastReading.measuredAt;
  if (!errors.length && isNewer) {
    update.lastReading = {
      soilMoisture: value.soilMoisture,
      temperature: value.temperature,
      airHumidity: value.airHumidity,
      measuredAt,
      source: value.source
    };
  }
  await Pot.updateOne({ _id: pot._id }, update);

  // El nodo volvió a reportar: si había alerta de fallo de sensor, se resuelve
  await resolveAlerts(pot, 'fallo_sensor');

  broadcast('reading', {
    potId: pot._id,
    potName: pot.name,
    soilMoisture: value.soilMoisture,
    temperature: value.temperature,
    airHumidity: value.airHumidity,
    measuredAt,
    source: value.source,
    status: reading.status
  }, pot.ownerId);

  // El motor de decisión solo corre sobre lecturas válidas y actuales (una lectura
  // retransmitida de hace horas no debe disparar un riego hoy)
  const isRecent = Date.now() - measuredAt.getTime() < 10 * 60 * 1000;
  if (!errors.length && isRecent) {
    await evaluateReading(pot, value);
  }
}

// Conexión/desconexión MQTT del nodo: refleja el estado online en la maceta y el dashboard
export async function handleNodeStatus(nodeId, online) {
  const pot = await Pot.findOneAndUpdate(
    { nodeId },
    { online, ...(online ? { lastSeenAt: new Date() } : {}) },
    { new: true }
  );
  if (pot) {
    broadcast('pot_status', { potId: pot._id, online }, pot.ownerId);
  }
}
