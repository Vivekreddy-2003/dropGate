/**
 * ORDERS SERVICE — simulated payment (9.8).
 */

const crypto = require('crypto');
const AppError = require('../../errors/AppError');
const ordersRepository = require('./orders.repository');

function toPublicOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    holdId: row.hold_id,
    userId: row.user_id,
    skuId: row.sku_id,
    qty: row.qty,
    amountCents: row.amount_cents,
    status: row.status,
    paymentRef: row.payment_ref,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

/**
 * Insert paid or failed order row. Caller owns hold validation + transaction.
 * @param {'success'|'fail'} result
 */
async function recordSimulatedPayment(trx, { hold, sku, result }) {
  const amountCents = sku.price_cents * hold.qty;
  const now = new Date();

  if (result === 'fail') {
    const order = await ordersRepository.insertOrder(trx, {
      hold_id: hold.id,
      user_id: hold.user_id,
      sku_id: hold.sku_id,
      qty: hold.qty,
      amount_cents: amountCents,
      status: 'failed',
      payment_ref: null,
      paid_at: null,
    });
    return toPublicOrder(order);
  }

  const order = await ordersRepository.insertOrder(trx, {
    hold_id: hold.id,
    user_id: hold.user_id,
    sku_id: hold.sku_id,
    qty: hold.qty,
    amount_cents: amountCents,
    status: 'paid',
    payment_ref: `sim_${crypto.randomUUID()}`,
    paid_at: now,
  });
  return toPublicOrder(order);
}

/**
 * Fetch one order for the confirmation screen. Owner-only.
 */
async function getOrderById(orderId, userId) {
  const row = await ordersRepository.findOrderById(orderId);
  if (!row) {
    throw new AppError('NOT_FOUND', 'Order not found', 404);
  }
  if (row.user_id !== userId) {
    throw new AppError('FORBIDDEN', 'You do not own this order', 403);
  }
  return toPublicOrder(row);
}

module.exports = {
  toPublicOrder,
  recordSimulatedPayment,
  getOrderById,
};
