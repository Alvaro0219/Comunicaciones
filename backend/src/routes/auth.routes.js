import { Router } from 'express';
import { validate } from '../middlewares/validate.js';
import { authLimiter } from '../middlewares/rateLimit.js';
import { registerSchema, loginSchema, refreshSchema } from '../schemas/auth.schemas.js';
import { register, login, refresh } from '../controllers/authController.js';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);
router.post('/refresh', validate(refreshSchema), refresh);

export default router;
