import Joi from 'joi';

// tlds: false porque el proyecto acepta dominios internos (ej. "gda.local")
// que Joi rechazaría contra su lista de TLDs públicos.
export const registerSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  password: Joi.string().min(8).max(72).required(),
  fullName: Joi.string().min(2).max(120).required()
});

export const loginSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  password: Joi.string().required()
});

export const refreshSchema = Joi.object({
  refreshToken: Joi.string().required()
});
