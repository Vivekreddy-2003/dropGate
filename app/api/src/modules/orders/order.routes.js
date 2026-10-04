const express = require('express');
const controller = require('./orders.controller');
const { authenticate } = require('../../middleware/auth');
const requireRole = require('../../middleware/requireRole');

const router = express.Router();

router.use(authenticate, requireRole('shopper'));

router.get('/:id', controller.getById);

module.exports = router;
