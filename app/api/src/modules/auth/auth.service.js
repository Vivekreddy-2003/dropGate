const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const AppError = require('../../errors/AppError');
const authRepository = require('./auth.repository');

const BCRYPT_ROUNDS = 10;

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );
}

async function register({ email, password, role }) {
  const existing = await authRepository.findByEmail(email);
  if (existing) {
    throw new AppError('CONFLICT', 'Email already registered', 409);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await authRepository.createUser({
    email,
    passwordHash,
    role,
  });

  const token = signToken(user);
  return {
    token,
    user: authRepository.toPublicUser(user),
  };
}

async function login({ email, password }) {
  const row = await authRepository._selectWithPassword(email);
  if (!row) {
    throw new AppError('UNAUTHORIZED', 'Invalid email or password', 401);
  }

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) {
    throw new AppError('UNAUTHORIZED', 'Invalid email or password', 401);
  }

  const user = authRepository.toPublicUser(row);
  const token = signToken(row);
  return { token, user };
}

async function getMe(userId) {
  const row = await authRepository.findById(userId);
  if (!row) {
    throw new AppError('NOT_FOUND', 'User not found', 404);
  }
  return authRepository.toPublicUser(row);
}

module.exports = { register, login, getMe };
