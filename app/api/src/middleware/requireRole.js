const AppError = require('../errors/AppError');

/**
 * @param {...('shopper'|'merchant')} roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('UNAUTHORIZED', 'Not authenticated', 401));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError('FORBIDDEN', 'Insufficient permissions', 403));
    }
    return next();
  };
}

module.exports = requireRole;
