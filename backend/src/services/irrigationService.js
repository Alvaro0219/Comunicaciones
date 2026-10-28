import { v4 as uuidv4 } from 'uuid';
import { IrrigationCommand } from '../models/IrrigationCommand.js';
import { Event } from '../models/Event.js';
import { Pot } from '../models/Pot.js';
import { env } from '../config/env.js';
import { broadcast } from '../realtime/sseHub.js';
import { publishCommand, isWriteMode } from '../mqtt/client.js';

const EVENT_TYPE_BY_ORIGIN = {
  auto: 'riego_activado',
  calor: 'riego_calor',
  manual: 'riego_manual'
};

// El firmware corta la bomba por seguridad si lleva demasiado encendida sin que la humedad
// suba (sensor suelto, tanque vacío, manguera desconectada). Ese corte no es un riego exitoso.
const SAFETY_CUT = /tiempo maximo/i;

// Circuito de ejecución de riego ORDENADO POR EL BACKEND (motor automático y riego manual).
// Publica la orden con el contrato del nodo: {"activar_riego":true,"duracion_seg":N}.
// Se agrega commandId para correlacionar la confirmación; el firmware que no lo
// conozca simplemente lo ignora y el matching cae al comando pendiente del nodo.
export async function triggerIrrigation({ pot, durationSec, origin, requestedBy = null, reason, readingSnapshot = {} }) {
  // Con CONTROL_RIEGO=nodo el firmware riega solo y todavía no procesa comandos: una orden
  // se perdería (expiraría como "fallida" sin que el nodo haya hecho nada). No se emite.
  if (env.irrigationControl === 'nodo') {
    return { skipped: true, reason: 'nodo_autonomo' };
  }

  // Guardia de equipo: en modo lectura (MODO_ESCRITURA=false) el backend evalúa
  // y registra la decisión, pero NO publica la orden. Evita que varios backends
  // de desarrollo rieguen el nodo real a la vez.
  if (!isWriteMode()) {
    const event = await Event.create({
      potId: pot._id,
      type: EVENT_TYPE_BY_ORIGIN[origin],
      origin: origin === 'manual' ? 'manual' : 'auto',
      byUserId: requestedBy,
      durationSec,
      result: 'no_aplica',
      message: `[modo lectura] riego omitido: MODO_ESCRITURA=false (habría regado ${durationSec}s)`,
      detail: { reason, ...readingSnapshot }
    });
    broadcast('event', await eventPayload(event, pot), pot.ownerId);
    return { skipped: true, reason: 'modo_lectura', event };
  }

  const pending = await IrrigationCommand.findOne({ potId: pot._id, status: 'enviada' });
  if (pending) return { skipped: true, reason: 'riego_en_curso' };

  const uuid = uuidv4();
  const event = await Event.create({
    potId: pot._id,
    type: EVENT_TYPE_BY_ORIGIN[origin],
    origin: origin === 'manual' ? 'manual' : 'auto',
    byUserId: requestedBy,
    durationSec,
    commandUuid: uuid,
    result: 'pendiente',
    message: origin === 'manual'
      ? `Riego manual solicitado (${durationSec}s)`
      : `Riego ${origin === 'calor' ? 'breve por calor' : 'automático'} activado (${durationSec}s)`,
    detail: { reason, ...readingSnapshot }
  });

  const command = await IrrigationCommand.create({
    potId: pot._id,
    nodeId: pot.nodeId,
    uuid,
    durationSec,
    origin,
    requestedBy,
    eventId: event._id
  });

  publishCommand(pot.nodeId, {
    activar_riego: true,
    duracion_seg: durationSec,
    commandId: uuid
  });

  await Pot.updateOne({ _id: pot._id }, {
    watering: { active: true, since: new Date(), commandId: uuid }
  });

  broadcast('event', await eventPayload(event, pot), pot.ownerId);
  broadcast('pot_status', { potId: pot._id, watering: { active: true, since: new Date(), commandId: uuid } }, pot.ownerId);

  return { skipped: false, command, event };
}

// Cierra una orden pendiente (confirmada o fallida) y refleja el resultado en el evento y la maceta.
async function finishCommand(command, { succeeded, detail = '', executedDurationSec = null }) {
  command.status = succeeded ? 'confirmada' : 'fallida';
  command.ackAt = new Date();
  command.detail = detail;
  await command.save();

  const event = await Event.findByIdAndUpdate(command.eventId, {
    result: succeeded ? 'confirmado' : 'fallido'
  }, { new: true });

  const potUpdate = { 'watering.active': false };
  if (succeeded) {
    potUpdate.lastIrrigation = {
      at: new Date(),
      durationSec: executedDurationSec || command.durationSec,
      origin: command.origin,
      result: 'ok'
    };
  }
  const pot = await Pot.findByIdAndUpdate(command.potId, potUpdate, { new: true });

  if (pot && event) {
    broadcast('event', await eventPayload(event, pot), pot.ownerId);
    broadcast('pot_status', {
      potId: pot._id,
      watering: pot.watering,
      lastIrrigation: pot.lastIrrigation
    }, pot.ownerId);
  }
}

// Confirmación explícita de una orden (contrato anterior / simulador):
//   {"evento":"riego_exitoso"}  o  {"ok":true|false,...}
// Si viene commandId se matchea exacto; si no, se confirma el comando pendiente más
// reciente de ese nodo.
export async function handleAck(nodeId, payload) {
  let succeeded;
  if (payload?.evento !== undefined) {
    succeeded = payload.evento === 'riego_exitoso';
  } else if (payload?.ok !== undefined) {
    succeeded = !!payload.ok;
  } else {
    return;
  }

  const query = { nodeId, status: 'enviada' };
  if (payload.commandId) query.uuid = payload.commandId;
  const command = await IrrigationCommand.findOne(query).sort({ sentAt: -1 });
  if (!command) return; // evento duplicado, expirado o sin comando pendiente

  await finishCommand(command, {
    succeeded,
    detail: payload.detail || payload.evento || '',
    executedDurationSec: payload.executedDurationSec
  });
}

// Estado de la bomba reportado por el nodo. Llega por dos vías: el evento que publica en
// cada cambio ({bomba, humedad, motivo}) y el campo `bomba` de cada telemetría. Es idempotente
// a propósito: el mismo estado puede llegar dos veces (o una sola si un mensaje se pierde, ya
// que el firmware publica sin QoS) y no debe duplicar eventos ni dejar la bomba "colgada".
export async function applyPumpState(pot, {
  on, humedad = null, motivo = null, commandId = null, executedDurationSec = null, via = 'evento'
}) {
  const cut = SAFETY_CUT.test(motivo || '');

  // Hay una orden del backend en curso: el apagado que reporta el nodo es su confirmación.
  // Con commandId se matchea esa orden exacta; sin él, la pendiente más reciente.
  const pendingQuery = { potId: pot._id, status: 'enviada' };
  if (commandId) pendingQuery.uuid = commandId;
  const pending = await IrrigationCommand.findOne(pendingQuery).sort({ sentAt: -1 });
  if (pending) {
    // Solo el EVENTO del nodo confirma una orden. El `bomba:false` de la telemetría llega cada
    // pocos segundos y puede ser anterior a que el nodo reciba la orden (o el nodo puede
    // ignorarla): darla por cumplida mostraría un riego exitoso que nunca ocurrió.
    if (!on && via === 'evento') {
      await finishCommand(pending, { succeeded: !cut, detail: motivo || 'bomba apagada', executedDurationSec });
    }
    return;
  }
  // Evento de una orden que ya no está pendiente (expirada): no se atribuye a un riego del nodo.
  if (commandId) return;

  // Riego que decidió el propio nodo con su regla local.
  const open = await Event.findOne({ potId: pot._id, source: 'nodo', result: 'pendiente' }).sort({ createdAt: -1 });

  if (on) {
    if (open) return; // ya registrado
    const watering = { active: true, since: new Date() };
    const event = await Event.create({
      potId: pot._id,
      type: 'riego_activado',
      origin: 'auto',
      source: 'nodo',
      result: 'pendiente',
      message: `Riego automático del nodo: ${motivo || 'bomba encendida'}`,
      detail: { reason: motivo || 'estado_bomba_telemetria', soilMoisture: humedad }
    });
    await Pot.updateOne({ _id: pot._id }, { watering });
    broadcast('event', await eventPayload(event, pot), pot.ownerId);
    broadcast('pot_status', { potId: pot._id, watering }, pot.ownerId);
    return;
  }

  // Bomba apagada.
  if (open) {
    const durationSec = Math.max(1, Math.round((Date.now() - open.createdAt.getTime()) / 1000));
    open.result = cut ? 'fallido' : 'confirmado';
    open.durationSec = durationSec;
    open.message = cut
      ? `Corte de seguridad del nodo: la bomba estuvo ${durationSec}s encendida sin que la humedad llegara al nivel esperado (revisar sensor, tanque o manguera)`
      : `Riego automático del nodo completado (${durationSec}s): ${motivo || 'bomba apagada'}`;
    await open.save();

    const potUpdate = { 'watering.active': false };
    if (!cut) potUpdate.lastIrrigation = { at: new Date(), durationSec, origin: 'auto', result: 'ok' };
    const updated = await Pot.findByIdAndUpdate(pot._id, potUpdate, { new: true });

    broadcast('event', await eventPayload(open, pot), pot.ownerId);
    broadcast('pot_status', {
      potId: pot._id,
      watering: updated.watering,
      lastIrrigation: updated.lastIrrigation
    }, pot.ownerId);
  } else if (pot.watering?.active) {
    // La bomba figuraba encendida pero no hay riego abierto (se perdió un mensaje): se corrige el estado.
    await Pot.updateOne({ _id: pot._id }, { 'watering.active': false });
    broadcast('pot_status', { potId: pot._id, watering: { active: false } }, pot.ownerId);
  }
}

// Mensajes de {PREFIX}/{nodeId}/evento. Conviven dos contratos:
//   - nodo real:  {"maceta_id":1,"bomba":true|false,"humedad":48,"motivo":"humedad menor a 50"}
//   - anterior:   {"evento":"riego_exitoso"} / {"ok":true}  (confirmación de una orden)
export async function handleNodeEvent(nodeId, payload) {
  if (typeof payload?.bomba === 'boolean') {
    const pot = await Pot.findOne({ nodeId, isActive: true });
    if (!pot) {
      console.warn(`Evento de nodo no registrado o inactivo: ${nodeId} (crear la maceta con ese nodeId)`);
      return;
    }
    await applyPumpState(pot, {
      on: payload.bomba,
      humedad: Number.isFinite(payload.humedad) ? payload.humedad : null,
      motivo: typeof payload.motivo === 'string' ? payload.motivo : null,
      commandId: typeof payload.commandId === 'string' && payload.commandId ? payload.commandId : null,
      // Segundos que la bomba estuvo realmente encendida (el nodo puede acotar la duración pedida)
      executedDurationSec: Number.isFinite(payload.duracion_seg) ? payload.duracion_seg : null,
      via: 'evento'
    });
    return;
  }
  await handleAck(nodeId, payload);
}

// Barrido periódico: órdenes enviadas sin confirmación dentro del timeout. El plazo es la
// duración del riego MÁS COMMAND_TIMEOUT_SEC de margen: una orden de 90 s no puede darse por
// perdida a los 60 s mientras la bomba todavía está regando.
export async function expireStaleCommands() {
  const sent = await IrrigationCommand.find({ status: 'enviada' });
  const now = Date.now();
  const stale = sent.filter(c => now - c.sentAt.getTime() > (c.durationSec + env.commandTimeoutSec) * 1000);

  for (const command of stale) {
    command.status = 'expirada';
    command.detail = 'Sin confirmación del nodo (timeout)';
    await command.save();

    const event = await Event.findByIdAndUpdate(command.eventId, {
      result: 'fallido',
      'detail.reason': 'timeout_sin_confirmacion'
    }, { new: true });

    const pot = await Pot.findByIdAndUpdate(command.potId, { 'watering.active': false }, { new: true });
    if (pot) {
      broadcast('event', await eventPayload(event, pot), pot.ownerId);
      broadcast('pot_status', { potId: pot._id, watering: pot.watering }, pot.ownerId);
    }
  }
}

async function eventPayload(event, pot) {
  return {
    _id: event._id,
    potId: pot._id,
    potName: pot.name,
    type: event.type,
    origin: event.origin,
    source: event.source,
    durationSec: event.durationSec,
    result: event.result,
    message: event.message,
    detail: event.detail,
    createdAt: event.createdAt
  };
}

// Riego manual sobre una zona de demostración (sin nodo físico): no publica nada en el
// broker; deja el mismo rastro que un riego real confirmado para poder mostrar el flujo.
export async function simulateDemoIrrigation({ pot, durationSec, requestedBy }) {
  const event = await Event.create({
    potId: pot._id,
    type: 'riego_manual',
    origin: 'manual',
    byUserId: requestedBy,
    durationSec,
    result: 'confirmado',
    message: `[zona de ejemplo] riego simulado de ${durationSec}s`,
    detail: { reason: 'riego_manual_dashboard', soilMoisture: pot.lastReading?.soilMoisture }
  });
  const updated = await Pot.findByIdAndUpdate(pot._id, {
    lastIrrigation: { at: new Date(), durationSec, origin: 'manual', result: 'ok' }
  }, { new: true });
  broadcast('event', await eventPayload(event, updated), updated.ownerId);
  broadcast('pot_status', { potId: updated._id, lastIrrigation: updated.lastIrrigation }, updated.ownerId);
  return { event };
}
