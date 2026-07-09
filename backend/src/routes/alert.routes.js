import { Router } from 'express';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { listAlerts, resolveAlert } from '../controllers/alertController.js';

const router = Router();

router.get('/', authenticate, listAlerts);
router.patch('/:id/resolve', authenticate, requireRole(['admin', 'tecnico']), resolveAlert);

export default router;
