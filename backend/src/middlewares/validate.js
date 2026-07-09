export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({ success: false, error: { message: error.message, code: 'VALIDATION_ERROR' } });
    }
    req.validated = value;
    next();
  };
}
