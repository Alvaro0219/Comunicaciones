import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';
import { AppError } from '../utils/AppError.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { potScope } from '../middlewares/auth.js';
import { Pot } from '../models/Pot.js';
import { Event } from '../models/Event.js';

// Historial de eventos de riego de una maceta, con filtros por fecha/tipo/origen
export const listPotEvents = asyncHandler(async (req, res) => {
  const pot = await Pot.findOne({ _id: req.params.id, ...potScope(req) }).select('_id').lean();
  if (!pot) throw new AppError('Maceta no encontrada', 404, 'NOT_FOUND');

  const { page, limit, skip } = getPagination(req, { defaultLimit: 30 });
  const filter = { potId: pot._id };
  if (req.query.type) filter.type = req.query.type;
  if (req.query.origin) filter.origin = req.query.origin;
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }

  const [items, total] = await Promise.all([
    Event.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('byUserId', 'fullName email').lean(),
    Event.countDocuments(filter)
  ]);

  return ok(res, buildPaginatedResponse(items, total, { page, limit }));
});
