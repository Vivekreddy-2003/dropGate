/**
 * DROPS REPOSITORY — Knex queries for drops.
 */

const db = require('../../db/knex');

const PUBLIC_LIST_STATUSES = ['scheduled', 'live', 'sold_out'];

async function findById(id, trx = db) {
  return trx('drops').where({ id }).first();
}

async function findBySlug(slug, trx = db) {
  return trx('drops').where({ slug: slug.toLowerCase() }).first();
}

async function listPublicDrops(trx = db) {
  return trx('drops')
    .whereIn('status', PUBLIC_LIST_STATUSES)
    .orderBy('goes_live_at', 'asc')
    .select('id', 'name', 'slug', 'status', 'goes_live_at', 'registration_opens_at');
}

async function findSkusByDropId(dropId, trx = db) {
  return trx('skus')
    .where({ drop_id: dropId })
    .select('id', 'name', 'price_cents', 'remaining_qty', 'total_qty');
}

async function listByMerchantId(merchantId, trx = db) {
  return trx('drops')
    .where({ merchant_id: merchantId })
    .orderBy('created_at', 'desc')
    .select('*');
}

async function findSkusByDropIds(dropIds, trx = db) {
  if (dropIds.length === 0) return [];
  return trx('skus')
    .whereIn('drop_id', dropIds)
    .select('id', 'drop_id', 'name', 'price_cents', 'remaining_qty', 'total_qty');
}

async function createDropWithSku(
  {
    merchantId,
    name,
    slug,
    registrationOpensAt,
    goesLiveAt,
    holdTtlSeconds,
    maxPerUser,
    admitBatchSize,
    sku,
  },
  trx = db,
) {
  const run = async (t) => {
    const [dropRow] = await t('drops')
      .insert({
        merchant_id: merchantId,
        name,
        slug: slug.toLowerCase(),
        status: 'draft',
        registration_opens_at: registrationOpensAt,
        goes_live_at: goesLiveAt,
        hold_ttl_seconds: holdTtlSeconds,
        max_per_user: maxPerUser,
        admit_batch_size: admitBatchSize,
      })
      .returning('*');

    const [skuRow] = await t('skus')
      .insert({
        drop_id: dropRow.id,
        name: sku.name,
        price_cents: sku.priceCents,
        total_qty: sku.totalQty,
        remaining_qty: sku.totalQty,
      })
      .returning('*');

    return { drop: dropRow, sku: skuRow };
  };

  if (trx !== db) {
    return run(trx);
  }
  return db.transaction(run);
}

async function countActiveHoldsForDrop(dropId, trx = db) {
  const row = await trx('holds')
    .where({ drop_id: dropId, status: 'held' })
    .count('* as count')
    .first();
  return Number(row?.count ?? 0);
}

async function countOrdersForDrop(dropId, trx = db) {
  const row = await trx('orders')
    .join('holds', 'orders.hold_id', 'holds.id')
    .where('holds.drop_id', dropId)
    .where('orders.status', 'paid')
    .count('* as count')
    .first();
  return Number(row?.count ?? 0);
}

async function updateStatus(id, status, trx = db) {
  const rows = await trx('drops')
    .where({ id })
    .update({
      status,
      updated_at: trx.fn.now(),
    })
    .returning('*');
  return rows[0] ?? null;
}

module.exports = {
  findById,
  findBySlug,
  listPublicDrops,
  findSkusByDropId,
  listByMerchantId,
  findSkusByDropIds,
  createDropWithSku,
  countActiveHoldsForDrop,
  countOrdersForDrop,
  updateStatus,
};
