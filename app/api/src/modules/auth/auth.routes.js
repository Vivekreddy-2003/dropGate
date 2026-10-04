const express = require('express');
const authController = require('./auth.controller');
const { authenticate } = require('../../middleware/auth');
const rateLimit = require('../../middleware/rateLimit');
const config = require('../../config');

const router = express.Router();

// Rate-limit login by IP: a brute-force or credential-stuffing attempt hits the
// same endpoint many times fast. The shared Redis counter stops it across all
// API processes. See docs/adr/0001.
const loginLimiter = rateLimit({
  name: 'login',
  max: config.redis.rateLimit.login.max,
  windowSeconds: config.redis.rateLimit.login.windowSeconds,
});

router.post('/register', authController.register);
router.post('/login', loginLimiter, authController.login);
router.get('/me', authenticate, authController.me);

module.exports = router;
