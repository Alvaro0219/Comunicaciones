import { Pot } from '../models/Pot.js';
import { Reading } from '../models/Reading.js';
import { broadcast } from '../realtime/sseHub.js';
import { resolveAlerts } from './alertService.js';
import { evaluateReading } from './decisionService.js';
import { applyPumpState } from './irrigationService.js';

// Ingesta de telemetría desde el broker en la nube.
//
// El nodo real publica cada pocos segundos en {PREFIX}/{nodeId}/telemetria:
//   { maceta_id, humedad, bomba, rssi, ssid, ip, heap }
//   - humedad: % de suelo ya calibrado (0–100) — sensor FC-28
//   - bomba:   estado actual del relé (true/false)
//   - rssi/ssid/ip/heap: diagnóstico del nodo
// temp_ambiente / hum_ambiente se suman cuando el AM2302 tenga código en el firmware;
// hasta entonces llegan como null y el sistema los tolera.
// Este módulo también acepta el contrato anterior en inglés (soilMoisture, etc.) que usa
// el simulador, y decide qué hacer según lo que llegó.

function normalizeTelemetry(raw) {
  const soil = raw.humedad ?? raw.soilMoisture ?? null;
  const temp = raw.temp_ambiente ?? raw.temperature ?? null;
  const air = raw.hum_ambiente ?? raw.airHumidity ?? null;

  // El firmware actual no manda timestamp: se usa la hora de recepción.
  // Si el nodo algún día manda measuredAt (epoch s) — ej. replay offline — se respeta.
  const measuredAt = Number.isFinite(raw.measuredAt) ? new Date(raw.measuredAt * 1000) : new Date();
  const source = raw.source === 'replay' ? 'replay' : 'live';

  // Estado del relé; null si el nodo no lo informa (contrato anterior / simulador)
  const pump = typeof raw.bomba === 'boolean' ? raw.bomba : null;

  const diagnostics = {};
  if (raw.rssi !== undefined) diagnostics.rssi = raw.rssi;
  if (raw.ssid !== undefined) diagnostics.ssid = raw.ssid;
  if (raw.ip !== undefined) diagnostics.ip = raw.ip;
  if (raw.heap !== undefined) diagnostics.heap = raw.heap;

  return { soil, temp, air, pump, measuredAt, source, diagnostics };
}

// Rangos físicamente posibles (solo se validan los campos presentes)
function rangeErrors({ soil, temp, air }) {
  const errors = [];
  if (soil < 0 || soil > 100) errors.push('humedad de suelo fuera de 0-100%');
  if (air != null && (air < 0 || air > 100)) errors.push('humedad de aire fuera de 0-100%');
  if (temp != null && (temp < -40 || temp > 80)) errors.push('temperatura fuera de -40..80°C');
  return errors;
}

export async function handleTelemetry(nodeId, raw) {
  const pot = await Pot.findOne({ nodeId, isActive: true });
  if (!pot) {
    console.warn(`Telemetría de nodo no registrado o inactivo: ${nodeId} (crear la maceta con ese nodeId)`);
    return;
  }

  const t = normalizeTelemetry(raw);

  // Cualquier mensaje del nodo cuenta como señal de vida
  const potUpdate = { lastSeenAt: new Date(), online: true };
  if (Object.keys(t.diagnostics).length > 0) {
    potUpdate.diagnostics = { ...t.diagnostics, at: new Date() };
  }

  // Sin humedad de suelo => es un heartbeat de diagnóstico (rssi/ip/heap).
  // Se refleja el estado del nodo pero no se registra lectura ni se decide riego.
  if (t.soil == null || typeof t.soil !== 'number') {
    await Pot.updateOne({ _id: pot._id }, potUpdate);
    await resolveAlerts(pot, 'fallo_sensor');
    if (t.pump !== null) await applyPumpState(pot, { on: t.pump, via: 'telemetria' });
    broadcast('pot_status', {
      potId: pot._id,
      online: true,
      diagnostics: potUpdate.diagnostics || pot.diagnostics
    }, pot.ownerId);
    return;
  }

  const errors = rangeErrors(t);

  let reading;
  try {
    reading = await Reading.create({
      potId: pot._id,
      nodeId,
      soilMoisture: t.soil,
      temperature: t.temp,
      airHumidity: t.air,
      measuredAt: t.measuredAt,
      source: t.source,
      status: errors.length ? 'invalida' : 'valida',
      invalidReason: errors.join('; ') || undefined
    });
  } catch (err) {
    if (err.code === 11000) return; // retransmisión duplicada: ya la tenemos
    throw err;
  }

  const isNewer = !pot.lastReading?.measuredAt || t.measuredAt > pot.lastReading.measuredAt;
  if (!errors.length && isNewer) {
    potUpdate.lastReading = {
      soilMoisture: t.soil,
      temperature: t.temp,
      airHumidity: t.air,
      measuredAt: t.measuredAt,
      source: t.source
    };
  }
  await Pot.updateOne({ _id: pot._id }, potUpdate);

  await resolveAlerts(pot, 'fallo_sensor');

  // El estado de la bomba que viaja en la telemetría es la red de seguridad del evento de
  // bomba: si ese evento se perdió, acá se registra o se cierra un riego SIN orden del backend
  // (via:'telemetria' nunca confirma una orden: eso lo hace solo el evento explícito).
  if (t.pump !== null) {
    await applyPumpState(pot, { on: t.pump, humedad: errors.length ? null : t.soil, via: 'telemetria' });
  }

  broadcast('reading', {
    potId: pot._id,
    potName: pot.name,
    soilMoisture: t.soil,
    temperature: t.temp,
    airHumidity: t.air,
    measuredAt: t.measuredAt,
    source: t.source,
    status: reading.status
  }, pot.ownerId);

  // El motor solo corre sobre lecturas válidas y actuales (una retransmisión
  // vieja no debe disparar un riego hoy)
  const isRecent = Date.now() - t.measuredAt.getTime() < 10 * 60 * 1000;
  if (!errors.length && isRecent) {
    await evaluateReading(pot, { soilMoisture: t.soil, temperature: t.temp, airHumidity: t.air });
  }
}
