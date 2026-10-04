const authService = require('./auth.service');
const { registerSchema, loginSchema } = require('./auth.validation');

async function register(req, res, next) {
  try {
    const body = registerSchema.parse(req.body);
    const result = await authService.register(body);
    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const body = loginSchema.parse(req.body);
    const result = await authService.login(body);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await authService.getMe(req.user.id);
    return res.status(200).json({ user });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, login, me };
