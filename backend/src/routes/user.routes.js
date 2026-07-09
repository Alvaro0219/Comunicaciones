import { Router } from 'express';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { createUserSchema, updateUserSchema, updatePreferencesSchema } from '../schemas/user.schemas.js';
import { getMe, updateMyPreferences, listUsers, createUser, updateUser } from '../controllers/userController.js';

const router = Router();
const adminOnly = requireRole(['admin']);

router.get('/me', authenticate, getMe);
router.put('/me/preferences', authenticate, validate(updatePreferencesSchema), updateMyPreferences);

router.get('/', authenticate, adminOnly, listUsers);
router.post('/', authenticate, adminOnly, validate(createUserSchema), createUser);
router.put('/:id', authenticate, adminOnly, validate(updateUserSchema), updateUser);

export default router;
