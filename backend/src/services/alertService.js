import { Alert } from '../models/Alert.js';
import { User } from '../models/User.js';
import { broadcast } from '../realtime/sseHub.js';
import { sendAlertEmail } from './notificationService.js';

// Crea una alerta si no hay ya una activa del mismo tipo para la maceta (anti-spam).
// Notifica por email según las preferencias del dueño y difunde por SSE.
export async function raiseAlert(pot, type, message, data = {}) {
  const existing = await Alert.findOne({ potId: pot._id, type, status: 'activa' });
  if (existing) return existing;

  const alert = await Alert.create({ potId: pot._id, type, message, data });
  broadcast('alert', {
    _id: alert._id,
    potId: pot._id,
    potName: pot.name,
    type,
    status: 'activa',
    message,
    createdAt: alert.createdAt
  }, pot.ownerId);

  const owner = await User.findById(pot.ownerId).lean();
  if (owner?.alertPrefs?.email && owner?.alertPrefs?.types?.[type] !== false) {
    const sent = await sendAlertEmail(owner, pot, alert);
    if (sent) await Alert.updateOne({ _id: alert._id }, { 'notified.email': true });
  }

  return alert;
}

// Resuelve automáticamente las alertas activas de un tipo cuando la condición desaparece.
export async function resolveAlerts(pot, types) {
  const list = Array.isArray(types) ? types : [types];
  const result = await Alert.updateMany(
    { potId: pot._id, type: { $in: list }, status: 'activa' },
    { status: 'resuelta', resolvedAt: new Date() }
  );
  if (result.modifiedCount > 0) {
    broadcast('alert_resolved', { potId: pot._id, types: list }, pot.ownerId);
  }
}
