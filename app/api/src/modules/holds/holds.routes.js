const express = require('express');
const controller = require('./holds.controller');
const { authenticate } = require('../../middleware/auth');
const requireRole = require('../../middleware/requireRole');

const router = express.Router();

router.use(authenticate, requireRole('shopper'));

router.post('/', controller.create);
router.get('/:id', controller.getById);
router.post('/:id/cancel', controller.cancel);
router.post('/:id/pay', controller.pay);

module.exports = router;
