export class ApiError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR', status = null) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
