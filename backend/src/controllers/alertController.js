import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';
import { AppError } from '../utils/AppError.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { potScope } from '../middlewares/auth.js';
import { Pot } from '../models/Pot.js';
import { Alert } from '../models/Alert.js';

// Ids de macetas a las que el usuario tiene acceso (admin: todas)
async function accessiblePotIds(req) {
  const pots = await Pot.find(potScope(req)).select('_id').lean();
  return pots.map(p => p._id);
}

export const listAlerts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req, { defaultLimit: 30 });
  const potIds = await accessiblePotIds(req);

  const filter = { potId: { $in: potIds } };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.potId) filter.potId = req.query.potId; // se intersecta con el $in vía acceso abajo
  if (req.query.potId && !potIds.some(id => String(id) === req.query.potId)) {
    throw new AppError('Maceta no encontrada', 404, 'NOT_FOUND');
  }
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }

  const [items, total] = await Promise.all([
    Alert.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('potId', 'name nodeId').lean(),
    Alert.countDocuments(filter)
  ]);

  return ok(res, buildPaginatedResponse(items, total, { page, limit }));
});

export const resolveAlert = asyncHandler(async (req, res) => {
  const potIds = await accessiblePotIds(req);
  const alert = await Alert.findOneAndUpdate(
    { _id: req.params.id, potId: { $in: potIds }, status: 'activa' },
    { status: 'resuelta', resolvedAt: new Date() },
    { new: true }
  );
  if (!alert) throw new AppError('Alerta no encontrada o ya resuelta', 404, 'NOT_FOUND');
  return ok(res, alert);
});
