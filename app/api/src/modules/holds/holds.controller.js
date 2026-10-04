/**
 * HOLDS CONTROLLER
 */

const holdsService = require('./holds.service');
const ordersRepository = require('../orders/orders.repository');
const { toPublicOrder } = require('../orders/orders.service');
const { createHoldSchema, payHoldSchema } = require('./holds.validation');
const {
  runIdempotent,
  getIdempotencyKey,
} = require('../idempotency/idempotency.service');

async function create(req, res, next) {
  try {
    const body = createHoldSchema.parse(req.body);
    const idempotencyKey = getIdempotencyKey(req);
    const route = 'POST /api/v1/holds';

    const { statusCode, body: responseBody } = await runIdempotent({
      userId: req.user.id,
      route,
      idempotencyKey,
      run: async () => {
        const hold = await holdsService.createHold({
          skuId: body.skuId,
          qty: body.qty,
          userId: req.user.id,
        });
        return { statusCode: 201, body: { hold } };
      },
    });

    return res.status(statusCode).json(responseBody);
  } catch (err) {
    return next(err);
  }
}

async function getById(req, res, next) {
  try {
    const hold = await holdsService.getHoldById(req.params.id, req.user.id);
    const orderRow = await ordersRepository.findOrderByHoldId(hold.id);
    const order = orderRow ? toPublicOrder(orderRow) : null;
    return res.status(200).json({ hold, order });
  } catch (err) {
    return next(err);
  }
}

async function cancel(req, res, next) {
  try {
    const hold = await holdsService.cancelHold(req.params.id, req.user.id);
    return res.status(200).json({ hold });
  } catch (err) {
    return next(err);
  }
}

async function pay(req, res, next) {
  try {
    const body = payHoldSchema.parse(req.body);
    const idempotencyKey = getIdempotencyKey(req);
    const route = `POST /api/v1/holds/${req.params.id}/pay`;

    const { statusCode, body: responseBody } = await runIdempotent({
      userId: req.user.id,
      route,
      idempotencyKey,
      run: async () => {
        const result = await holdsService.payHold(
          req.params.id,
          req.user.id,
          body.result,
        );
        return { statusCode: 200, body: result };
      },
    });

    return res.status(statusCode).json(responseBody);
  } catch (err) {
    return next(err);
  }
}

module.exports = { create, getById, cancel, pay };
