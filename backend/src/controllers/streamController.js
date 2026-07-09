import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ok } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { addClient } from '../realtime/sseHub.js';

// EventSource no permite headers: se emite un token efímero con propósito 'sse'
// que viaja por query param y se valida en authenticateSse.
export const issueStreamToken = asyncHandler(async (req, res) => {
  const token = jwt.sign(
    { sub: req.user.sub, role: req.user.role, purpose: 'sse' },
    env.jwtSecret,
    { expiresIn: env.sseTokenExpiresIn }
  );
  return ok(res, { token });
});

export const openStream = (req, res) => {
  addClient(req, res);
};
