import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { fail } from '../utils/response.js';

export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return fail(res, 'Missing token', 401, 'UNAUTHORIZED');
  try {
    req.user = jwt.verify(token, env.jwtSecret);
    return next();
  } catch {
    return fail(res, 'Invalid or expired token', 401, 'UNAUTHORIZED');
  }
}

export function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return fail(res, 'Forbidden', 403, 'FORBIDDEN');
    }
    return next();
  };
}

// Variante para conexiones SSE: el token viaja por query param (EventSource no
// permite headers), es de vida corta y con propósito explícito 'sse'.
export function authenticateSse(req, res, next) {
  const token = req.query.token;
  if (!token) return fail(res, 'Missing token', 401, 'UNAUTHORIZED');
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (payload.purpose !== 'sse') throw new Error('wrong purpose');
    req.user = payload;
    return next();
  } catch {
    return fail(res, 'Invalid stream token', 401, 'UNAUTHORIZED');
  }
}

// Alcance de macetas por rol: el admin ve todo; técnico/visualizador solo las propias.
export function potScope(req) {
  return req.user.role === 'admin' ? {} : { ownerId: req.user.sub };
}
