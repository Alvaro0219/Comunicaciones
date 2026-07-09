import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import { env } from './config/env.js';
import { connectDb } from './config/db.js';
import routes from './routes/index.js';
import { globalApiLimiter } from './middlewares/rateLimit.js';
import { AppError } from './utils/AppError.js';
import { startBroker } from './mqtt/broker.js';
import { startJobs } from './jobs/scheduler.js';
import { handleTelemetry, handleNodeStatus } from './services/ingestService.js';
import { handleAck } from './services/irrigationService.js';

const app = express();

// 1. CORS con orígenes explícitos
const corsOptions = {
  origin(origin, cb) {
    if (!origin || env.corsOrigins.length === 0 || env.corsOrigins.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error('Origen no permitido por CORS'));
  },
  credentials: true
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// 2-4. Logging, headers de seguridad, body parser
app.use(morgan('dev'));
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

// 5. Rate limiter global sobre /api
app.use('/api', globalApiLimiter);

// 6. Healthcheck
app.get('/health', (req, res) => res.json({ ok: true }));

// 7. Rutas de la app
app.use('/api', routes);

// 8. Error handler global — siempre al final
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  if (err instanceof AppError) {
    return res.status(err.status).json({ success: false, error: { message: err.message, code: err.code } });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, error: { message: err.message, code: 'VALIDATION_ERROR' } });
  }
  if (err.code === 11000) {
    return res.status(409).json({ success: false, error: { message: 'Duplicate resource', code: 'CONFLICT' } });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, error: { message: 'Invalid identifier', code: 'INVALID_ID' } });
  }

  return res.status(500).json({ success: false, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } });
});

async function startServer() {
  try {
    await connectDb();
    console.log('MongoDB conectado');

    app.listen(env.port, () => {
      console.log(`API GDA escuchando en puerto ${env.port} (${env.nodeEnv})`);
    });

    // Capa de ingesta ESP32: broker MQTT embebido con los handlers de dominio
    startBroker({
      port: env.mqttPort,
      onTelemetry: handleTelemetry,
      onAck: handleAck,
      onNodeStatus: handleNodeStatus
    });

    startJobs();
  } catch (err) {
    console.error('Error fatal al iniciar el servidor:', err);
    process.exit(1);
  }
}

startServer();
