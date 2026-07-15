import dotenv from 'dotenv';
import Joi from 'joi';
dotenv.config();

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(4000),
  MONGO_URL: Joi.string().uri().required(),
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('1d'),
  REFRESH_SECRET: Joi.string().min(16).required(),
  REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  SSE_TOKEN_EXPIRES_IN: Joi.string().default('60s'),
  CORS_ORIGINS: Joi.string().allow('').default(''),

  // MQTT — broker en la nube (HiveMQ Cloud). El backend es CLIENTE del broker.
  MQTT_HOST: Joi.string().allow('').default(''),
  MQTT_PORT: Joi.number().default(8883),
  MQTT_USER: Joi.string().allow('').default(''),
  MQTT_PASS: Joi.string().allow('').default(''),
  MQTT_CLIENT_ID: Joi.string().default('gda-backend-dev'),
  TOPIC_PREFIX: Joi.string().default('gda/prod'),
  // Guardia de escritura: false = evalúa y loguea pero no publica comandos.
  // Solo el backend desplegado corre con true (regla del equipo).
  MODO_ESCRITURA: Joi.boolean().default(false),

  RAIN_PROB_THRESHOLD: Joi.number().min(0).max(100).default(50),
  HEAT_TEMP_THRESHOLD: Joi.number().default(35),
  DEFAULT_IRRIGATION_SEC: Joi.number().min(1).default(5),
  HEAT_IRRIGATION_SEC: Joi.number().min(1).default(3),
  SENSOR_TIMEOUT_MIN: Joi.number().min(1).default(15),
  COMMAND_TIMEOUT_SEC: Joi.number().min(5).default(60),
  WEATHER_TTL_HOURS: Joi.number().min(1).default(3),
  SMTP_HOST: Joi.string().allow('').default(''),
  SMTP_PORT: Joi.number().default(587),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASS: Joi.string().allow('').default(''),
  MAIL_FROM: Joi.string().default('GDA <no-reply@gda.local>')
}).unknown(true);

const { error, value: parsed } = schema.validate(process.env, {
  allowUnknown: true,
  stripUnknown: false
});

if (error && process.env.NODE_ENV === 'production') {
  console.error('Invalid environment configuration:', error.message);
  process.exit(1);
} else if (error) {
  console.warn('Environment warning (non-production):', error.message);
}

export const env = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.PORT,
  corsOrigins: (parsed.CORS_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean),
  mongoUrl: parsed.MONGO_URL || 'mongodb://localhost:27017/gda',
  jwtSecret: parsed.JWT_SECRET || 'change_me',
  jwtExpiresIn: parsed.JWT_EXPIRES_IN,
  refreshSecret: parsed.REFRESH_SECRET || 'change_me_refresh',
  refreshExpiresIn: parsed.REFRESH_EXPIRES_IN,
  sseTokenExpiresIn: parsed.SSE_TOKEN_EXPIRES_IN,
  mqtt: {
    host: parsed.MQTT_HOST,
    port: parsed.MQTT_PORT,
    user: parsed.MQTT_USER,
    pass: parsed.MQTT_PASS,
    clientId: parsed.MQTT_CLIENT_ID,
    topicPrefix: parsed.TOPIC_PREFIX,
    writeMode: parsed.MODO_ESCRITURA === true || parsed.MODO_ESCRITURA === 'true'
  },
  rainProbThreshold: parsed.RAIN_PROB_THRESHOLD,
  heatTempThreshold: parsed.HEAT_TEMP_THRESHOLD,
  defaultIrrigationSec: parsed.DEFAULT_IRRIGATION_SEC,
  heatIrrigationSec: parsed.HEAT_IRRIGATION_SEC,
  sensorTimeoutMin: parsed.SENSOR_TIMEOUT_MIN,
  commandTimeoutSec: parsed.COMMAND_TIMEOUT_SEC,
  weatherTtlHours: parsed.WEATHER_TTL_HOURS,
  smtp: {
    host: parsed.SMTP_HOST,
    port: parsed.SMTP_PORT,
    user: parsed.SMTP_USER,
    pass: parsed.SMTP_PASS,
    from: parsed.MAIL_FROM
  }
};
