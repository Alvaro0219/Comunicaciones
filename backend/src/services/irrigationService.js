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

// Circuito único de ejecución de riego (motor automático y riego manual).
// Publica la orden con el contrato del nodo: {"activar_riego":true,"duracion_seg":N}.
// Se agrega commandId para correlacionar la confirmación; el firmware que no lo
// conozca simplemente lo ignora y el matching cae al comando pendiente del nodo.
export async function triggerIrrigation({ pot, durationSec, origin, requestedBy = null, reason, readingSnapshot = {} }) {
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

// Confirmación del nodo en {PREFIX}/{nodeId}/evento.
// Contrato del firmware: {"maceta_id":1,"evento":"riego_exitoso"} — sin commandId.
// Si viene commandId (simulador nuevo / firmware futuro) se matchea exacto;
// si no, se confirma el comando pendiente más reciente de ese nodo.
export async function handleAck(nodeId, payload) {
  let succeeded;
  if (payload?.evento !== undefined) {
    succeeded = payload.evento === 'riego_exitoso';
  } else if (payload?.ok !== undefined) {
    succeeded = !!payload.ok; // contrato legado
  } else {
    return;
  }

  const query = { nodeId, status: 'enviada' };
  if (payload.commandId) query.uuid = payload.commandId;
  const command = await IrrigationCommand.findOne(query).sort({ sentAt: -1 });
  if (!command) return; // evento duplicado, expirado o sin comando pendiente

  command.status = succeeded ? 'confirmada' : 'fallida';
  command.ackAt = new Date();
  command.detail = payload.detail || payload.evento || '';
  await command.save();

  const event = await Event.findByIdAndUpdate(command.eventId, {
    result: succeeded ? 'confirmado' : 'fallido'
  }, { new: true });

  const potUpdate = { 'watering.active': false };
  if (succeeded) {
    potUpdate.lastIrrigation = {
      at: new Date(),
      durationSec: payload.executedDurationSec || command.durationSec,
      origin: command.origin,
      result: 'ok'
    };
  }
  const pot = await Pot.findByIdAndUpdate(command.potId, potUpdate, { new: true });

  if (pot) {
    broadcast('event', await eventPayload(event, pot), pot.ownerId);
    broadcast('pot_status', {
      potId: pot._id,
      watering: pot.watering,
      lastIrrigation: pot.lastIrrigation
    }, pot.ownerId);
  }
}

// Barrido periódico: órdenes enviadas sin confirmación dentro del timeout.
export async function expireStaleCommands() {
  const cutoff = new Date(Date.now() - env.commandTimeoutSec * 1000);
  const stale = await IrrigationCommand.find({ status: 'enviada', sentAt: { $lt: cutoff } });

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
    durationSec: event.durationSec,
    result: event.result,
    message: event.message,
    detail: event.detail,
    createdAt: event.createdAt
  };
}
