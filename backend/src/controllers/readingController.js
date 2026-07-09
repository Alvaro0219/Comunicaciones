import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';
import { AppError } from '../utils/AppError.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { potScope } from '../middlewares/auth.js';
import { Pot } from '../models/Pot.js';
import { Reading } from '../models/Reading.js';

async function assertPotAccess(req) {
  const pot = await Pot.findOne({ _id: req.params.id, ...potScope(req) }).select('_id').lean();
  if (!pot) throw new AppError('Maceta no encontrada', 404, 'NOT_FOUND');
  return pot;
}

// Historial paginado con filtro por rango de fechas (?from=ISO&to=ISO)
export const listReadings = asyncHandler(async (req, res) => {
  const pot = await assertPotAccess(req);
  const { page, limit, skip } = getPagination(req, { defaultLimit: 50 });

  const filter = { potId: pot._id };
  if (req.query.from || req.query.to) {
    filter.measuredAt = {};
    if (req.query.from) filter.measuredAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.measuredAt.$lte = new Date(req.query.to);
  }

  const [items, total] = await Promise.all([
    Reading.find(filter).sort({ measuredAt: -1 }).skip(skip).limit(limit).lean(),
    Reading.countDocuments(filter)
  ]);

  return ok(res, buildPaginatedResponse(items, total, { page, limit }));
});

// Últimas N horas (default 24) para el gráfico del dashboard — sin paginar
export const recentReadings = asyncHandler(async (req, res) => {
  const pot = await assertPotAccess(req);
  const hours = Math.min(parseInt(req.query.hours, 10) || 24, 168);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const items = await Reading.find({
    potId: pot._id,
    status: 'valida',
    measuredAt: { $gte: since }
  }).sort({ measuredAt: 1 }).limit(2000).lean();

  return ok(res, items);
});
