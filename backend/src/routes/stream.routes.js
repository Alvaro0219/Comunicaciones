import { Router } from 'express';
import { authenticate, authenticateSse } from '../middlewares/auth.js';
import { issueStreamToken, openStream } from '../controllers/streamController.js';

const router = Router();

router.post('/token', authenticate, issueStreamToken);
router.get('/', authenticateSse, openStream);

export default router;
