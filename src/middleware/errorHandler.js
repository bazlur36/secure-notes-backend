const { ZodError } = require('zod');
const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const { nodeEnv } = require('../config/env');

function notFound(req, _res, next) {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  let status = 500;
  let message = 'Internal server error';
  let details;

  if (err instanceof AppError) {
    status = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    status = 400;
    message = 'Validation failed';
    details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid ${err.path}`;
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err && err.code === 11000) {
    status = 409;
    message = `Duplicate value for ${Object.keys(err.keyPattern || {}).join(', ') || 'unique field'}`;
  } else if (err && err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (err && err.status === 413) {
    status = 413;
    message = 'Request body too large';
  }

  if (status === 500) console.error(err);

  res.status(status).json({
    error: { message, ...(details && { details }) },
    ...(nodeEnv !== 'production' && status === 500 && { stack: err.stack }),
  });
}

module.exports = { notFound, errorHandler };
