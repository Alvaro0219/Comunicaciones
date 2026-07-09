import rateLimit from 'express-rate-limit';

function buildLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { message, code: 'RATE_LIMITED' } }
  });
}

export const globalApiLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Demasiadas solicitudes, intente nuevamente más tarde'
});

export const authLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Demasiados intentos de autenticación, intente nuevamente más tarde'
});

export const irrigationLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Demasiadas órdenes de riego, espere un momento'
});
