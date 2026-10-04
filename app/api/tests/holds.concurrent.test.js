/**
 * 9.11 — Last-unit concurrency: one 201, one SOLD_OUT.
 *
 * Run: npm test (requires DATABASE_URL and migrated DB).
 */

require('dotenv').config();

const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const db = require('../src/db/knex');
const holdsService = require('../src/modules/holds/holds.service');
const AppError = require('../src/errors/AppError');

async function seedConcurrentScenario() {
  const suffix = Date.now();
  const passwordHash = await bcrypt.hash('testpass123', 10);

  const [merchant] = await db('users')
    .insert({
      email: `merchant-${suffix}@test.local`,
      password_hash: passwordHash,
      role: 'merchant',
    })
    .returning('*');

  const [userA, userB] = await db('users')
    .insert([
      {
        email: `shopper-a-${suffix}@test.local`,
        password_hash: passwordHash,
        role: 'shopper',
      },
      {
        email: `shopper-b-${suffix}@test.local`,
        password_hash: passwordHash,
        role: 'shopper',
      },
    ])
    .returning('*');

  const now = new Date();
  const [drop] = await db('drops')
    .insert({
      merchant_id: merchant.id,
      name: `Concurrency drop ${suffix}`,
      slug: `concurrency-${suffix}`,
      status: 'live',
      registration_opens_at: new Date(now.getTime() - 60_000),
      goes_live_at: new Date(now.getTime() - 30_000),
      hold_ttl_seconds: 600,
      max_per_user: 1,
      admit_batch_size: 2,
    })
    .returning('*');

  const [sku] = await db('skus')
    .insert({
      drop_id: drop.id,
      name: 'Test SKU',
      total_qty: 1,
      remaining_qty: 1,
      price_cents: 1000,
    })
    .returning('*');

  await db('waiting_room_entries').insert([
    {
      drop_id: drop.id,
      user_id: userA.id,
      position: 1,
      status: 'admitted',
      admitted_at: now,
    },
    {
      drop_id: drop.id,
      user_id: userB.id,
      position: 2,
      status: 'admitted',
      admitted_at: now,
    },
  ]);

  return { drop, sku, userA, userB, merchant, suffix };
}

async function cleanup({ suffix, drop, userA, userB, merchant }) {
  await db('inventory_movements').whereIn('sku_id', function () {
    this.select('id').from('skus').where('drop_id', drop.id);
  }).del();
  await db('orders').whereIn('hold_id', function () {
    this.select('id').from('holds').where('drop_id', drop.id);
  }).del();
  await db('holds').where({ drop_id: drop.id }).del();
  await db('waiting_room_entries').where({ drop_id: drop.id }).del();
  await db('skus').where({ drop_id: drop.id }).del();
  await db('drops').where({ id: drop.id }).del();
  await db('users')
    .whereIn('email', [
      `merchant-${suffix}@test.local`,
      `shopper-a-${suffix}@test.local`,
      `shopper-b-${suffix}@test.local`,
    ])
    .del();
}

test('parallel POST /holds with remaining_qty=1 yields one success and one SOLD_OUT', async (t) => {
  let ctx;
  t.after(async () => {
    if (ctx) {
      await cleanup(ctx);
    }
    await db.destroy();
  });

  ctx = await seedConcurrentScenario();

  const postHold = (userId) =>
    holdsService.createHold({
      userId,
      skuId: ctx.sku.id,
      qty: 1,
    });

  const results = await Promise.allSettled([postHold(ctx.userA.id), postHold(ctx.userB.id)]);

  const successes = results.filter((r) => r.status === 'fulfilled');
  const failures = results.filter((r) => r.status === 'rejected');

  assert.equal(successes.length, 1, 'exactly one hold should succeed');
  assert.equal(failures.length, 1, 'exactly one hold should fail');

  const err = failures[0].reason;
  assert.ok(err instanceof AppError);
  assert.equal(err.code, 'SOLD_OUT');
  assert.equal(err.statusCode, 409);

  const skuRow = await db('skus').where({ id: ctx.sku.id }).first();
  assert.equal(skuRow.remaining_qty, 0);

  const holdRows = await db('holds')
    .where({ drop_id: ctx.drop.id, status: 'held' });
  assert.equal(holdRows.length, 1);
});
