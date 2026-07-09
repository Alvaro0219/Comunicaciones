import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';

function issueTokens(user) {
  const accessToken = jwt.sign({
    sub: user._id.toString(),
    role: user.role,
    fullName: user.fullName
  }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

  const refreshToken = jwt.sign({ sub: user._id.toString() }, env.refreshSecret, {
    expiresIn: env.refreshExpiresIn
  });

  return { accessToken, refreshToken };
}

function publicUser(user) {
  return {
    _id: user._id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    alertPrefs: user.alertPrefs
  };
}

export async function register({ email, password, fullName }) {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw new AppError('El email ya está registrado', 409, 'CONFLICT');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ email, passwordHash, fullName, role: 'tecnico' });
  return { user: publicUser(user), ...issueTokens(user) };
}

export async function login({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase(), isActive: true });
  if (!user) throw new AppError('Credenciales inválidas', 401, 'INVALID_CREDENTIALS');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError('Credenciales inválidas', 401, 'INVALID_CREDENTIALS');

  return { user: publicUser(user), ...issueTokens(user) };
}

export async function refresh(refreshToken) {
  let payload;
  try {
    payload = jwt.verify(refreshToken, env.refreshSecret);
  } catch {
    throw new AppError('Refresh token inválido', 401, 'INVALID_REFRESH');
  }
  const user = await User.findOne({ _id: payload.sub, isActive: true });
  if (!user) throw new AppError('Usuario no encontrado', 401, 'INVALID_REFRESH');
  return { user: publicUser(user), ...issueTokens(user) };
}
