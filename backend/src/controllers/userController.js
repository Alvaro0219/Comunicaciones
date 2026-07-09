import bcrypt from 'bcryptjs';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';
import { AppError } from '../utils/AppError.js';
import { getPagination, buildPaginatedResponse } from '../utils/pagination.js';
import { User } from '../models/User.js';

const PUBLIC_FIELDS = '-passwordHash';

// ─── Perfil propio (cualquier rol) ─────────────────────────

export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.sub).select(PUBLIC_FIELDS).lean();
  if (!user) throw new AppError('Usuario no encontrado', 404, 'NOT_FOUND');
  return ok(res, user);
});

export const updateMyPreferences = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.user.sub,
    { alertPrefs: req.validated.alertPrefs },
    { new: true }
  ).select(PUBLIC_FIELDS);
  return ok(res, user);
});

// ─── Gestión de usuarios (solo admin) ──────────────────────

export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req, { defaultLimit: 50 });
  const [items, total] = await Promise.all([
    User.find({}).select(PUBLIC_FIELDS).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments({})
  ]);
  return ok(res, buildPaginatedResponse(items, total, { page, limit }));
});

export const createUser = asyncHandler(async (req, res) => {
  const { email, password, fullName, role } = req.validated;
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw new AppError('El email ya está registrado', 409, 'CONFLICT');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ email, passwordHash, fullName, role });
  const { passwordHash: _, ...publicUser } = user.toObject();
  return ok(res, publicUser, 201);
});

export const updateUser = asyncHandler(async (req, res) => {
  const update = { ...req.validated };
  if (update.password) {
    update.passwordHash = await bcrypt.hash(update.password, 10);
    delete update.password;
  }
  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true })
    .select(PUBLIC_FIELDS);
  if (!user) throw new AppError('Usuario no encontrado', 404, 'NOT_FOUND');
  return ok(res, user);
});
