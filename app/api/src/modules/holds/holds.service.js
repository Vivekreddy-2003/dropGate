/**
 * HOLDS SERVICE — business logic (steps 9.2–9.9).
 */

const db = require('../../db/knex');
const AppError = require('../../errors/AppError');
const dropsRepository = require('../drops/drops.repository');
const waitingRoomRepository = require('../waiting-room/waiting-room.repository');
const waitingRoomService = require('../waiting-room/waiting-room.service');
const holdsRepository = require('./holds.repository');
const ordersService = require('../orders/orders.service');

function toPublicHold(row) {
  if (!row) return null;
  return {
    id: row.id,
    dropId: row.drop_id,
    skuId: row.sku_id,
    userId: row.user_id,
    qty: row.qty,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

async function loadHoldForUser(holdId, userId) {
  const hold = await holdsRepository.findHoldById(holdId);
  if (!hold) {
    throw new AppError('NOT_FOUND', 'Hold not found', 404);
  }
  if (hold.user_id !== userId) {
    throw new AppError('FORBIDDEN', 'You do not own this hold', 403);
  }
  return hold;
}

/**
 * Build step 9.2 — must pass before atomic reserve (9.3).
 */
async function assertCanReserve({ userId, skuId, qty }) {
  const sku = await holdsRepository.findSkuById(skuId);
  if (!sku) {
    throw new AppError('NOT_FOUND', 'SKU not found', 404);
  }

  const drop = await dropsRepository.findById(sku.drop_id);
  if (!drop) {
    throw new AppError('NOT_FOUND', 'Drop not found', 404);
  }

  if (drop.status !== 'live') {
    throw new AppError('CONFLICT', 'Drop is not live', 409);
  }

  if (qty > drop.max_per_user) {
    throw new AppError(
      'VALIDATION',
      `Cannot reserve more than ${drop.max_per_user} per user`,
      400,
    );
  }

  const waitingRoomEntry = await waitingRoomRepository.findEntryByDropAndUser(
    drop.id,
    userId,
  );
  if (!waitingRoomEntry) {
    throw new AppError(
      'NOT_ADMITTED',
      'Join the waiting room before reserving',
      403,
    );
  }
  if (waitingRoomEntry.status !== 'admitted') {
    throw new AppError(
      'NOT_ADMITTED',
      'You must be admitted before reserving',
      403,
    );
  }

  const activeHold = await holdsRepository.findActiveHoldByUserAndDrop(
    userId,
    drop.id,
  );
  if (activeHold) {
    throw new AppError('CONFLICT', 'You already have an active hold for this drop', 409);
  }

  return { sku, drop, waitingRoomEntry };
}

async function createHold({ userId, skuId, qty }) {
  const { drop } = await assertCanReserve({ userId, skuId, qty });
  const expiresAt = new Date(Date.now() + drop.hold_ttl_seconds * 1000);

  const hold = await db.transaction(async (trx) => {
    return holdsRepository.createHold(trx, {
      userId,
      dropId: drop.id,
      skuId,
      qty,
      expiresAt,
    });
  });

  return toPublicHold(hold);
}

/**
 * 9.5 expire on read + 9.7 admitNext
 */
async function maybeExpireHold(hold) {
  if (hold.status !== 'held') {
    return hold;
  }
  if (new Date() <= new Date(hold.expires_at)) {
    return hold;
  }

  return db.transaction(async (trx) => {
    // Re-read inside the transaction: `hold` above is a snapshot. Another request
    // may have expired this row (GET expire-on-read), cancelled it, or paid (9.8)
    // before we started the txn — we need current status/TTL before mutating.
    const fresh = await holdsRepository.findHoldById(hold.id, trx);
    if (!fresh || fresh.status !== 'held') {
      return fresh;
    }
    if (new Date() <= new Date(fresh.expires_at)) {
      return fresh;
    }

    const { hold: released, didRelease } = await holdsRepository.releaseHold(
      trx,
      fresh,
      'expired',
      'expire',
    );
    if (didRelease) {
      await waitingRoomService.admitNext(fresh.drop_id, trx);
    }
    return released;
  });
}

async function getHoldById(holdId, userId) {
  const hold = await loadHoldForUser(holdId, userId);
  const current = await maybeExpireHold(hold);
  return toPublicHold(current);
}

/**
 * 9.6 cancel + 9.7 admitNext
 */
async function cancelHold(holdId, userId) {
  // Outside any transaction: fast auth + UX (404/403/409). This row is a snapshot —
  // not locked. Another request can change it before we open the txn below, e.g.:
  //   • GET /holds/:id (expire-on-read) → status expired, stock restored, admitNext
  //   • POST /holds/:id/cancel (double submit) → status released
  //   • POST /holds/:id/pay (9.8) → status no longer held
  const hold = await loadHoldForUser(holdId, userId);

  if (hold.status !== 'held') {
    throw new AppError('CONFLICT', 'Only active holds can be cancelled', 409);
  }

  const released = await db.transaction(async (trx) => {
    // Re-check under the txn so we don't release stock / admitNext twice if the
    // snapshot was stale. Final safety is releaseHold's UPDATE … WHERE status='held'.
    const fresh = await holdsRepository.findHoldById(holdId, trx);
    if (!fresh || fresh.status !== 'held') {
      throw new AppError('CONFLICT', 'Hold is no longer active', 409);
    }

    const { hold: updated, didRelease } = await holdsRepository.releaseHold(
      trx,
      fresh,
      'released',
      'release',
    );
    if (didRelease) {
      await waitingRoomService.admitNext(fresh.drop_id, trx);
    }
    return updated;
  });

  return toPublicHold(released);
}

function assertHoldActiveForPay(hold) {
  if (hold.status !== 'held') {
    throw new AppError('CONFLICT', 'Only active holds can be paid', 409);
  }
  if (new Date() > new Date(hold.expires_at)) {
    throw new AppError('CONFLICT', 'Hold has expired', 409);
  }
}

/**
 * 9.8 pay simulate + 9.9 purchased. Fail path: failed order row; hold stays held until TTL.
 */
async function payHold(holdId, userId, result) {
  let hold = await loadHoldForUser(holdId, userId);
  hold = await maybeExpireHold(hold);
  assertHoldActiveForPay(hold);

  const payload = await db.transaction(async (trx) => {
    const fresh = await holdsRepository.findHoldById(holdId, trx);
    if (!fresh || fresh.status !== 'held') {
      throw new AppError('CONFLICT', 'Hold is no longer active', 409);
    }
    if (new Date() > new Date(fresh.expires_at)) {
      throw new AppError('CONFLICT', 'Hold has expired', 409);
    }

    const sku = await holdsRepository.findSkuById(fresh.sku_id, trx);
    if (!sku) {
      throw new AppError('NOT_FOUND', 'SKU not found', 404);
    }

    const order = await ordersService.recordSimulatedPayment(trx, {
      hold: fresh,
      sku,
      result,
    });

    if (result === 'fail') {
      return { hold: toPublicHold(fresh), order };
    }

    const confirmed = await holdsRepository.confirmHold(trx, holdId);
    if (!confirmed) {
      throw new AppError('CONFLICT', 'Hold is no longer active', 409);
    }

    await waitingRoomRepository.markPurchased(trx, fresh.drop_id, userId);

    const skuAfter = await holdsRepository.findSkuById(fresh.sku_id, trx);
    const heldCount = await holdsRepository.countHeldHoldsForDrop(fresh.drop_id, trx);
    if (skuAfter.remaining_qty === 0 && heldCount === 0) {
      await dropsRepository.updateStatus(fresh.drop_id, 'sold_out', trx);
    }

    return { hold: toPublicHold(confirmed), order };
  });

  return payload;
}

module.exports = {
  assertCanReserve,
  createHold,
  getHoldById,
  cancelHold,
  payHold,
};
