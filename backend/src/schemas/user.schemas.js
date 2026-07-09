import Joi from 'joi';

export const createUserSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  password: Joi.string().min(8).max(72).required(),
  fullName: Joi.string().min(2).max(120).required(),
  role: Joi.string().valid('admin', 'tecnico', 'visualizador').required()
});

export const updateUserSchema = Joi.object({
  fullName: Joi.string().min(2).max(120),
  role: Joi.string().valid('admin', 'tecnico', 'visualizador'),
  isActive: Joi.boolean(),
  password: Joi.string().min(8).max(72)
}).min(1);

export const updatePreferencesSchema = Joi.object({
  alertPrefs: Joi.object({
    email: Joi.boolean(),
    types: Joi.object({
      critica: Joi.boolean(),
      preventiva: Joi.boolean(),
      calor_extremo: Joi.boolean(),
      fallo_sensor: Joi.boolean(),
      exceso_humedad: Joi.boolean()
    })
  }).required()
});
