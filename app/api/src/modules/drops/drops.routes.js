const express = require('express');
const controller = require('./drops.controller');
const { authenticate } = require('../../middleware/auth');
const requireRole = require('../../middleware/requireRole');
const rateLimit = require('../../middleware/rateLimit');
const config = require('../../config');

const router = express.Router();

// Rate-limit "join waiting room" per USER (not IP): the request is
// authenticated, so counting by user id is both fairer and NAT-proof (many real
// users can share one office/mobile IP). The limiter runs after authenticate so
// req.user is populated. See docs/adr/0001.
const joinLimiter = rateLimit({
  name: 'join',
  max: config.redis.rateLimit.join.max,
  windowSeconds: config.redis.rateLimit.join.windowSeconds,
  identifier: (req) => req.user?.id || req.ip,
});

router.get('/', controller.listPublic);

// A merchant's own drops (any status). Static path, so it's declared before the
// dynamic `/:id/...` routes to avoid being shadowed.
router.get(
  '/mine',
  authenticate,
  requireRole('merchant'),
  controller.listMine,
);

router.get('/slug/:slug', controller.getBySlug);

router.post(
  '/',
  authenticate,
  requireRole('merchant'),
  controller.create,
);

router.get(
  '/:id/admin',
  authenticate,
  requireRole('merchant'),
  controller.getAdmin,
);

router.post(
  '/:id/schedule',
  authenticate,
  requireRole('merchant'),
  controller.schedule,
);

router.post(
  '/:id/go-live',
  authenticate,
  requireRole('merchant'),
  controller.goLive,
);

router.get(
  '/:id/waiting-room/me',
  authenticate,
  requireRole('shopper'),
  controller.getWaitingRoomMe,
);

router.post(
  '/:id/waiting-room',
  authenticate,
  requireRole('shopper'),
  joinLimiter,
  controller.joinWaitingRoom,
);

module.exports = router;
