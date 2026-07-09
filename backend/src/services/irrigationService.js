import { v4 as uuidv4 } from 'uuid';
import { IrrigationCommand } from '../models/IrrigationCommand.js';
import { Event } from '../models/Event.js';
import { Pot } from '../models/Pot.js';
import { env } from '../config/env.js';
import { broadcast } from '../realtime/sseHub.js';
import { publishCommand } from '../mqtt/broker.js';

const EVENT_TYPE_BY_ORIGIN = {
  auto: 'riego_activado',
  calor: 'riego_calor',
  manual: 'riego_manual'
};

// Circuito único de ejecución de riego (lo usan tanto el motor automático como el
// riego manual): crea la orden, la publica por MQTT al nodo y registra el evento
// en estado 'pendiente' hasta que llegue la confirmación (ack) del ESP32.
export async function triggerIrrigation({ pot, durationSec, origin, requestedBy = null, reason, readingSnapshot = {} }) {
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

  publishCommand(pot.nodeId, { commandId: uuid, action: 'regar', durationSec });

  await Pot.updateOne({ _id: pot._id }, {
    watering: { active: true, since: new Date(), commandId: uuid }
  });

  broadcast('event', await eventPayload(event, pot), pot.ownerId);
  broadcast('pot_status', { potId: pot._id, watering: { active: true, since: new Date(), commandId: uuid } }, pot.ownerId);

  return { skipped: false, command, event };
}

// Confirmación (o fallo) reportado por el nodo vía MQTT en gda/{nodeId}/ack
export async function handleAck(nodeId, payload) {
  const { commandId, ok: succeeded, detail, executedDurationSec } = payload || {};
  if (!commandId) return;

  const command = await IrrigationCommand.findOne({ uuid: commandId, nodeId, status: 'enviada' });
  if (!command) return; // ack duplicado, expirado o de un comando desconocido

  command.status = succeeded ? 'confirmada' : 'fallida';
  command.ackAt = new Date();
  command.detail = detail || '';
  await command.save();

  const event = await Event.findByIdAndUpdate(command.eventId, {
    result: succeeded ? 'confirmado' : 'fallido',
    ...(detail ? { 'detail.reason': detail } : {})
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

  if (pot) {
    broadcast('event', await eventPayload(event, pot), pot.ownerId);
    broadcast('pot_status', {
      potId: pot._id,
      watering: pot.watering,
      lastIrrigation: pot.lastIrrigation
    }, pot.ownerId);
  }
}

// Barrido periódico: órdenes enviadas sin ack dentro del timeout se marcan expiradas.
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
