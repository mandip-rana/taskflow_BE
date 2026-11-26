const { Error: MongooseError } = require('mongoose');
const AppError = require('../shared/utils/AppError');
const {
  BAD_REQUEST,
  PAYLOAD_TOO_LARGE,
  INTERNAL_SERVER_ERROR,
} = require('../shared/constants/http');

/** Maps known library errors to AppError so clients get a clean 4xx instead of a 500. */
const normalizeError = (err) => {
  if (err instanceof AppError) return err;

  if (err instanceof MongooseError.ValidationError) {
    const errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return new AppError('Validation failed', BAD_REQUEST, errors);
  }
  if (err instanceof MongooseError.CastError) {
    return new AppError(`Invalid value for "${err.path}"`, BAD_REQUEST);
  }
  if (err.type === 'entity.parse.failed') {
    return new AppError('Request body contains invalid JSON', BAD_REQUEST);
  }
  if (err.type === 'entity.too.large') {
    return new AppError('Request body is too large', PAYLOAD_TOO_LARGE);
  }
  return err;
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const error = normalizeError(err);
  const statusCode = error.statusCode || INTERNAL_SERVER_ERROR;
  const isServerError = statusCode >= 500;

  // Full details go to the server log only, never to the client.
  if (isServerError) console.error(`${req.method} ${req.originalUrl}`, err);

  res.status(statusCode).json({
    success: false,
    message: isServerError ? 'Internal server error' : error.message,
    ...(!isServerError && error.details && { errors: error.details }),
  });
};

module.exports = errorHandler;
