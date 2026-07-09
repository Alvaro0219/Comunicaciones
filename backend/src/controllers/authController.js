import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';
import * as authService from '../services/authService.js';

export const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.validated);
  return ok(res, result, 201);
});

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.validated);
  return ok(res, result);
});

export const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refresh(req.validated.refreshToken);
  return ok(res, result);
});
