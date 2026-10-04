/**
 * HOLDS REPOSITORY — Knex queries (9.2+).
 */

const AppError = require('../../errors/AppError');
const db = require('../../db/knex');

async function findSkuById(skuId, trx = db) {
  return trx('skus').where({ id: skuId }).first();
}

async function findHoldById(holdId, trx = db) {
  return trx('holds').where({ id: holdId }).first();
}

async function findActiveHoldByUserAndDrop(userId, dropId, trx = db) {
  return trx('holds')
    .where({
      user_id: userId,
      drop_id: dropId,
      status: 'held',
    })
    .first();
}

async function insertInventoryMovement(trx, { skuId, holdId, delta, reason, orderId = null }) {
  return trx('inventory_movements').insert({
    sku_id: skuId,
    hold_id: holdId,
    order_id: orderId,
    delta,
    reason,
  });
}

async function createHold(trx, { userId, dropId, skuId, qty, expiresAt }) {
  const updatedCount = await trx('skus')
    .where({ id: skuId })
    .where('remaining_qty', '>=', qty)
    .update({
      remaining_qty: trx.raw('remaining_qty - ?', [qty]),
    });

  if (updatedCount === 0) {
    const sku = await findSkuById(skuId, trx);
    if (!sku) {
      throw new AppError('NOT_FOUND', 'SKU not found', 404);
    }
    throw new AppError('SOLD_OUT', 'No units remaining', 409);
  }

  const rows = await trx('holds')
    .insert({
      user_id: userId,
      drop_id: dropId,
      sku_id: skuId,
      qty,
      status: 'held',
      expires_at: expiresAt,
    })
    .returning('*');

  const hold = rows[0];

  await insertInventoryMovement(trx, {
    skuId,
    holdId: hold.id,
    delta: -qty,
    reason: 'hold',
  });

  return hold;
}

/**
 * Release stock for an active hold (expire or cancel).
 * @param {'expired'|'released'} newStatus
 * @param {'expire'|'release'} movementReason
 */
async function releaseHold(trx, hold, newStatus, movementReason) {
  const updatedRows = await trx('holds')
    .where({ id: hold.id, status: 'held' })
    .update({ status: newStatus })
    .returning('*');

  if (updatedRows.length === 0) {
    const current = await trx('holds').where({ id: hold.id }).first();
    return { hold: current, didRelease: false };
  }

  await trx('skus')
    .where({ id: hold.sku_id })
    .update({
      remaining_qty: trx.raw('remaining_qty + ?', [hold.qty]),
    });

  await insertInventoryMovement(trx, {
    skuId: hold.sku_id,
    holdId: hold.id,
    delta: hold.qty,
    reason: movementReason,
  });

  return { hold: updatedRows[0], didRelease: true };
}

async function confirmHold(trx, holdId) {
  const updatedRows = await trx('holds')
    .where({ id: holdId, status: 'held' })
    .update({ status: 'confirmed' })
    .returning('*');

  if (updatedRows.length === 0) {
    return null;
  }
  return updatedRows[0];
}

async function countHeldHoldsForDrop(dropId, trx = db) {
  const result = await trx('holds')
    .where({ drop_id: dropId, status: 'held' })
    .count('id as count');
  return Number(result[0]?.count ?? 0);
}

module.exports = {
  findSkuById,
  findHoldById,
  findActiveHoldByUserAndDrop,
  createHold,
  releaseHold,
  confirmHold,
  countHeldHoldsForDrop,
};
