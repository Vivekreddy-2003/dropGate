const db = require('../../db/knex');

async function findStored(userId, route, key, trx = db) {
  return trx('idempotency_keys')
    .where({ user_id: userId, route, key })
    .first();
}

async function insertStored(trx = db, { userId, route, key, statusCode, responseBody }) {
  const rows = await trx('idempotency_keys')
    .insert({
      user_id: userId,
      route,
      key,
      status_code: statusCode,
      response_body: responseBody,
    })
    .returning('*');
  return rows[0];
}

module.exports = {
  findStored,
  insertStored,
};
