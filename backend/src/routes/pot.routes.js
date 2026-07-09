import { Router } from 'express';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { irrigationLimiter } from '../middlewares/rateLimit.js';
import { createPotSchema, updatePotSchema, irrigateSchema } from '../schemas/pot.schemas.js';
import {
  listPots, getPot, createPot, updatePot, deletePot, irrigatePot, getPotWeather
} from '../controllers/potController.js';
import { listReadings, recentReadings } from '../controllers/readingController.js';
import { listPotEvents } from '../controllers/eventController.js';

const router = Router();
const canManage = requireRole(['admin', 'tecnico']);

router.get('/', authenticate, listPots);
router.post('/', authenticate, canManage, validate(createPotSchema), createPot);
router.get('/:id', authenticate, getPot);
router.put('/:id', authenticate, canManage, validate(updatePotSchema), updatePot);
router.delete('/:id', authenticate, canManage, deletePot);

// Riego manual (visualizador NO puede forzar riego)
router.post('/:id/irrigate', irrigationLimiter, authenticate, canManage, validate(irrigateSchema), irrigatePot);

// Telemetría, eventos y clima de la maceta (lectura: todos los roles con acceso)
router.get('/:id/readings', authenticate, listReadings);
router.get('/:id/readings/recent', authenticate, recentReadings);
router.get('/:id/events', authenticate, listPotEvents);
router.get('/:id/weather', authenticate, getPotWeather);

export default router;
