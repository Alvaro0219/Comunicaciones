import Joi from 'joi';

const locationSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lon: Joi.number().min(-180).max(180).required(),
  label: Joi.string().max(120).allow('')
});

export const createPotSchema = Joi.object({
  name: Joi.string().min(1).max(120).required(),
  nodeId: Joi.string().pattern(/^[a-zA-Z0-9_-]{3,64}$/).required(),
  minMoisture: Joi.number().min(0).max(100).default(30),
  maxMoisture: Joi.number().min(0).max(100).greater(Joi.ref('minMoisture')).default(70),
  irrigationDurationSec: Joi.number().min(1).max(600).default(5),
  heatTempThreshold: Joi.number().min(0).max(60).default(35),
  heatIrrigationDurationSec: Joi.number().min(1).max(600).default(3),
  rainProbThreshold: Joi.number().min(0).max(100).default(50),
  location: locationSchema.optional(),
  isActive: Joi.boolean().default(true)
});

export const updatePotSchema = Joi.object({
  name: Joi.string().min(1).max(120),
  minMoisture: Joi.number().min(0).max(100),
  maxMoisture: Joi.number().min(0).max(100),
  irrigationDurationSec: Joi.number().min(1).max(600),
  heatTempThreshold: Joi.number().min(0).max(60),
  heatIrrigationDurationSec: Joi.number().min(1).max(600),
  rainProbThreshold: Joi.number().min(0).max(100),
  location: locationSchema,
  isActive: Joi.boolean()
}).min(1);

export const irrigateSchema = Joi.object({
  durationSec: Joi.number().min(1).max(600).optional()
});
