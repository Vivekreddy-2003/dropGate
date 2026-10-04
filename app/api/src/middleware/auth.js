const jwt = require('jsonwebtoken');
const config = require('../config');
const AppError = require('../errors/AppError');

/**
 * Requires Authorization: Bearer <token>
 * Sets req.user = { id, role }
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError('UNAUTHORIZED', 'Missing or invalid token', 401));
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = {
      id: payload.sub,
      role: payload.role,
    };
    return next();
  } catch {
    return next(new AppError('UNAUTHORIZED', 'Invalid or expired token', 401));
  }
}

module.exports = { authenticate };
