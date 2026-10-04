/**
 * DROPS SERVICE
 */

const db = require('../../db/knex');
const AppError = require('../../errors/AppError');
const dropsRepository = require('./drops.repository');
const waitingRoomService = require('../waiting-room/waiting-room.service');
const dropCache = require('../../cache/dropCache');

function toPublicDrop(row) {
  if (!row) return null;
  return {
    id: row.id,
    merchantId: row.merchant_id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    registrationOpensAt: row.registration_opens_at,
    goesLiveAt: row.goes_live_at,
    holdTtlSeconds: row.hold_ttl_seconds,
    maxPerUser: row.max_per_user,
    admitBatchSize: row.admit_batch_size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function scheduleDrop(dropId, merchantUserId) {
  const drop = await dropsRepository.findById(dropId);
  if (!drop) {
    throw new AppError('NOT_FOUND', 'Drop not found', 404);
  }
  if (drop.merchant_id !== merchantUserId) {
    throw new AppError('FORBIDDEN', 'You are not allowed to schedule this drop', 403);
  }
  if (drop.status !== 'draft') {
    throw new AppError('CONFLICT', 'Only draft drops can be scheduled', 409);
  }

  const updated = await dropsRepository.updateStatus(dropId, 'scheduled');
  // The public page just changed (draft → scheduled): drop the stale cache so
  // the next reader sees the new state immediately instead of waiting out the TTL.
  await dropCache.invalidateDrop(drop.slug);
  return toPublicDrop(updated);
}

async function goLiveDrop(dropId, merchantUserId) {
  const drop = await dropsRepository.findById(dropId);
  if (!drop) {
    throw new AppError('NOT_FOUND', 'Drop not found', 404);
  }
  if (drop.merchant_id !== merchantUserId) {
    throw new AppError('FORBIDDEN', 'You are not allowed to go live with this drop', 403);
  }
  if (drop.status !== 'scheduled') {
    throw new AppError('CONFLICT', 'Drop must be scheduled before go-live', 409);
  }

  const result = await db.transaction(async (trx) => {
    const updated = await dropsRepository.updateStatus(dropId, 'live', trx);
    const { admittedCount } = await waitingRoomService.admitNext(dropId, trx);
    return {
      drop: toPublicDrop(updated),
      admittedCount,
    };
  });

  // Invalidate only AFTER the transaction commits. If we cleared the cache
  // inside the txn and it then rolled back, we'd have thrown away a valid entry
  // for a change that never happened. Order matters.
  await dropCache.invalidateDrop(drop.slug);
  return result;
}

function toPublicSku(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    priceCents: row.price_cents,
    remainingQty: row.remaining_qty,
    totalQty: row.total_qty,
  };
}

function toPublicListDrop(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    goesLiveAt: row.goes_live_at,
    registrationOpensAt: row.registration_opens_at,
  };
}

async function listPublicDrops() {
  const rows = await dropsRepository.listPublicDrops();
  return { drops: rows.map(toPublicListDrop) };
}

async function getDropBySlug(slug) {
  console.log(`\n[flow] ▶ GET drop by slug="${slug}" — checking cache first...`);
  // 1. Read-through cache: try Redis first. A hit skips Postgres entirely —
  //    this is the whole point of caching the hot read.
  const cached = await dropCache.getCachedDrop(slug);
  if (cached) {
    console.log('[flow] ◀ served from CACHE (no Postgres query ran)\n');
    return cached;
  }

  // 2. Cache miss (or Redis down): fall back to the source of truth.
  console.log('[flow]   querying Postgres (source of truth)...');
  const drop = await dropsRepository.findBySlug(slug);
  if (!drop) {
    throw new AppError('NOT_FOUND', 'Drop not found', 404);
  }
  if (!['scheduled', 'live', 'sold_out'].includes(drop.status)) {
    throw new AppError('NOT_FOUND', 'Drop not found', 404);
  }
  const skuRows = await dropsRepository.findSkusByDropId(drop.id);
  const payload = {
    drop: toPublicDrop(drop),
    skus: skuRows.map(toPublicSku),
  };

  // 3. Populate the cache for the next reader. Best-effort, short TTL.
  //    Note: skus[].remainingQty here is a display value and may be slightly
  //    stale — the sale decision is made against Postgres, not this cache.
  await dropCache.setCachedDrop(slug, payload);
  console.log('[flow] ◀ served from POSTGRES (cache now populated for next time)\n');

  return payload;
}

/**
 * List all drops created by this merchant (any status, newest first), each with
 * a quick stock summary. Used by the merchant dashboard so a returning merchant
 * sees everything they have created.
 */
async function listMyDrops(merchantUserId) {
  const drops = await dropsRepository.listByMerchantId(merchantUserId);
  const dropIds = drops.map((d) => d.id);

  // One query for all SKUs of these drops, then group in memory (no N+1).
  const skuRows = await dropsRepository.findSkusByDropIds(dropIds);
  const skusByDrop = new Map();
  for (const sku of skuRows) {
    if (!skusByDrop.has(sku.drop_id)) skusByDrop.set(sku.drop_id, []);
    skusByDrop.get(sku.drop_id).push(sku);
  }

  return {
    drops: drops.map((drop) => {
      const dropSkus = skusByDrop.get(drop.id) ?? [];
      const remainingQty = dropSkus.reduce((sum, s) => sum + s.remaining_qty, 0);
      const totalQty = dropSkus.reduce((sum, s) => sum + s.total_qty, 0);
      return {
        ...toPublicDrop(drop),
        skus: dropSkus.map(toPublicSku),
        stats: { remainingQty, totalQty },
      };
    }),
  };
}

async function createDrop(merchantUserId, body) {
  const existing = await dropsRepository.findBySlug(body.slug);
  if (existing) {
    throw new AppError('CONFLICT', 'Slug already in use', 409);
  }

  const { drop, sku } = await dropsRepository.createDropWithSku({
    merchantId: merchantUserId,
    name: body.name,
    slug: body.slug,
    registrationOpensAt: body.registrationOpensAt,
    goesLiveAt: body.goesLiveAt,
    holdTtlSeconds: body.holdTtlSeconds,
    maxPerUser: body.maxPerUser,
    admitBatchSize: body.admitBatchSize,
    sku: body.sku,
  });

  return {
    drop: toPublicDrop(drop),
    sku: toPublicSku(sku),
  };
}

async function getAdminSnapshot(dropId, merchantUserId) {
  const drop = await dropsRepository.findById(dropId);
  if (!drop) {
    throw new AppError('NOT_FOUND', 'Drop not found', 404);
  }
  if (drop.merchant_id !== merchantUserId) {
    throw new AppError('FORBIDDEN', 'You are not allowed to view this drop', 403);
  }

  const skuRows = await dropsRepository.findSkusByDropId(dropId);
  const remainingQty = skuRows.reduce((sum, s) => sum + s.remaining_qty, 0);
  const activeHoldCount = await dropsRepository.countActiveHoldsForDrop(dropId);
  const paidOrderCount = await dropsRepository.countOrdersForDrop(dropId);

  return {
    drop: toPublicDrop(drop),
    skus: skuRows.map(toPublicSku),
    stats: {
      remainingQty,
      activeHoldCount,
      paidOrderCount,
    },
  };
}

module.exports = {
  scheduleDrop,
  goLiveDrop,
  toPublicDrop,
  listPublicDrops,
  getDropBySlug,
  listMyDrops,
  createDrop,
  getAdminSnapshot,
};
