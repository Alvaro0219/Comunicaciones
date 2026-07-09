import { Router } from 'express';
import authRoutes from './auth.routes.js';
import potRoutes from './pot.routes.js';
import alertRoutes from './alert.routes.js';
import userRoutes from './user.routes.js';
import streamRoutes from './stream.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/pots', potRoutes);
router.use('/alerts', alertRoutes);
router.use('/users', userRoutes);
router.use('/stream', streamRoutes);

export default router;
