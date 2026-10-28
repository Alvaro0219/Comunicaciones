import { v4 as uuidv4 } from 'uuid';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';
import { AppError } from '../utils/AppError.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { potScope } from '../middlewares/auth.js';
import { Pot } from '../models/Pot.js';
import { Alert } from '../models/Alert.js';
import { Reading } from '../models/Reading.js';
import { Event } from '../models/Event.js';
import { IrrigationCommand } from '../models/IrrigationCommand.js';
import { triggerIrrigation, simulateDemoIrrigation } from '../services/irrigationService.js';
import { getForecast } from '../services/weatherService.js';

async function findAccessiblePot(req) {
  const pot = await Pot.findOne({ _id: req.params.id, ...potScope(req) });
  if (!pot) throw new AppError('Zona no encontrada', 404, 'NOT_FOUND');
  return pot;
}

export const listPots = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req, { defaultLimit: 50 });
  const filter = { ...potScope(req) };
  if (req.query.active === 'true') filter.isActive = true;

  const [items, total] = await Promise.all([
    Pot.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Pot.countDocuments(filter)
  ]);

  // Conteo de alertas activas por maceta para el dashboard
  const potIds = items.map(p => p._id);
  const alertCounts = await Alert.aggregate([
    { $match: { potId: { $in: potIds }, status: 'activa' } },
    { $group: { _id: '$potId', count: { $sum: 1 } } }
  ]);
  const countByPot = Object.fromEntries(alertCounts.map(a => [String(a._id), a.count]));
  for (const pot of items) pot.activeAlerts = countByPot[String(pot._id)] || 0;

  return ok(res, buildPaginatedResponse(items, total, { page, limit }));
});

export const getPot = asyncHandler(async (req, res) => {
  const pot = await findAccessiblePot(req);
  return ok(res, pot);
});

export const createPot = asyncHandler(async (req, res) => {
  const existing = await Pot.findOne({ nodeId: req.validated.nodeId });
  if (existing) throw new AppError('Ya existe una zona con ese nodeId', 409, 'CONFLICT');

  const pot = await Pot.create({
    ...req.validated,
    ownerId: req.user.sub,
    deviceToken: uuidv4() // credencial MQTT del nodo, se muestra una vez creado
  });
  return ok(res, pot, 201);
});

export const updatePot = asyncHandler(async (req, res) => {
  // Coherencia de umbrales cuando se actualizan por separado
  const current = await findAccessiblePot(req);
  const min = req.validated.minMoisture ?? current.minMoisture;
  const max = req.validated.maxMoisture ?? current.maxMoisture;
  if (min >= max) throw new AppError('El umbral mínimo debe ser menor al máximo', 400, 'VALIDATION_ERROR');

  const pot = await Pot.findOneAndUpdate(
    { _id: req.params.id, ...potScope(req) },
    req.validated,
    { new: true }
  );
  return ok(res, pot);
});

export const deletePot = asyncHandler(async (req, res) => {
  // Borrado definitivo (?permanent=true): solo de zonas ya desactivadas; elimina también
  // sus lecturas, eventos, alertas y órdenes. Sin el parámetro, el borrado es lógico.
  if (req.query.permanent === 'true') {
    const target = await findAccessiblePot(req);
    if (target.isActive) throw new AppError('Desactivá la zona antes de eliminarla definitivamente', 409, 'POT_ACTIVE');
    await Promise.all([
      Reading.deleteMany({ potId: target._id }),
      Event.deleteMany({ potId: target._id }),
      Alert.deleteMany({ potId: target._id }),
      IrrigationCommand.deleteMany({ potId: target._id })
    ]);
    await target.deleteOne();
    return ok(res, { deleted: true });
  }
  const pot = await Pot.findOneAndUpdate(
    { _id: req.params.id, ...potScope(req) },
    { isActive: false },
    { new: true }
  );
  if (!pot) throw new AppError('Zona no encontrada', 404, 'NOT_FOUND');
  return ok(res, pot);
});

// Riego manual desde el dashboard: mismo circuito de ejecución/confirmación que el automático
export const irrigatePot = asyncHandler(async (req, res) => {
  const pot = await findAccessiblePot(req);
  if (!pot.isActive) throw new AppError('La zona está inactiva', 409, 'POT_INACTIVE');
  if (!pot.online) throw new AppError('El nodo está offline: no puede recibir la orden', 409, 'NODE_OFFLINE');

  const durationSec = req.validated.durationSec || pot.irrigationDurationSec;
  if (pot.isDemo) {
    const demo = await simulateDemoIrrigation({ pot, durationSec, requestedBy: req.user.sub });
    return ok(res, { event: demo.event, simulated: true }, 202);
  }

  const result = await triggerIrrigation({
    pot,
    durationSec,
    origin: 'manual',
    requestedBy: req.user.sub,
    reason: 'riego_manual_dashboard'
  });
  if (result.skipped && result.reason === 'nodo_autonomo') {
    throw new AppError(
      'El nodo riega de forma autónoma con su regla local y todavía no procesa comandos remotos: el riego manual no está disponible',
      409, 'NODE_NO_COMMANDS'
    );
  }
  if (result.skipped && result.reason === 'modo_lectura') {
    throw new AppError(
      'Este backend está en modo lectura (MODO_ESCRITURA=false): la decisión quedó registrada pero no se publicó la orden',
      409, 'READ_ONLY'
    );
  }
  if (result.skipped) throw new AppError('Ya hay un riego en curso para esta zona', 409, 'IRRIGATION_IN_PROGRESS');

  return ok(res, { command: result.command, event: result.event }, 202);
});

export const getPotWeather = asyncHandler(async (req, res) => {
  const pot = await findAccessiblePot(req);
  if (pot.location?.lat == null) {
    throw new AppError('La zona no tiene ubicación configurada', 400, 'NO_LOCATION');
  }
  const forecast = await getForecast(pot.location.lat, pot.location.lon);
  if (!forecast) throw new AppError('Pronóstico no disponible', 503, 'WEATHER_UNAVAILABLE');
  return ok(res, forecast);
});
