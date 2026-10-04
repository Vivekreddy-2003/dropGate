/**
 * ORDERS REPOSITORY — Knex queries (step 9.8).
 */

const db = require('../../db/knex');

async function insertOrder(trx, data) {
  const rows = await trx('orders').insert(data).returning('*');
  return rows[0];
}

async function findOrderById(id, trx = db) {
  return trx('orders').where({ id }).first();
}

async function findOrderByHoldId(holdId, trx = db) {
  return trx('orders').where({ hold_id: holdId }).first();
}

module.exports = {
  insertOrder,
  findOrderById,
  findOrderByHoldId,
};
