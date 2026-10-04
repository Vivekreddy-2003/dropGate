const AppError = require('../errors/AppError');

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
  }

  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION',
        message: err.errors.map((e) => e.message).join('; '),
      },
    });
  }

  console.error(err);
  return res.status(500).json({
    error: { code: 'INTERNAL', message: 'Something went wrong' },
  });
}

module.exports = errorHandler;
