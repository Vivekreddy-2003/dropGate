/**
 * WAITING ROOM REPOSITORY
 */

const db = require('../../db/knex');

async function findEntryByDropAndUser(dropId, userId, trx = db) {
  return trx('waiting_room_entries')
    .where({ drop_id: dropId, user_id: userId })
    .first();
}

async function getMaxPosition(trx, dropId) {
  const row = await trx('waiting_room_entries')
    .where({ drop_id: dropId })
    .max('position as max_pos')
    .first();
  return Number(row?.max_pos ?? 0);
}

async function insertEntry(trx, { dropId, userId, position }) {
  const rows = await trx('waiting_room_entries')
    .insert({
      drop_id: dropId,
      user_id: userId,
      position,
      status: 'queued',
    })
    .returning('*');
  return rows[0];
}

async function countQueuedAhead(dropId, position, trx = db) {
  const result = await trx('waiting_room_entries')
    .where({ drop_id: dropId, status: 'queued' })
    .where('position', '<', position)
    .count('id as count');
  return Number(result[0]?.count ?? 0);
}

async function findQueuedForUpdate(trx, dropId, limit) {
  return trx('waiting_room_entries')
    .where({ drop_id: dropId, status: 'queued' })
    .orderBy('position', 'asc')
    .limit(limit)
    .forUpdate();
}

async function markAdmitted(trx, entryIds, { admittedAt }) {
  if (entryIds.length === 0) {
    return 0;
  }
  return trx('waiting_room_entries').whereIn('id', entryIds).update({
    status: 'admitted',
    admitted_at: admittedAt,
  });
}

async function markPurchased(trx, dropId, userId) {
  const rows = await trx('waiting_room_entries')
    .where({ drop_id: dropId, user_id: userId })
    .update({ status: 'purchased' })
    .returning('*');
  return rows[0] ?? null;
}

module.exports = {
  findEntryByDropAndUser,
  getMaxPosition,
  insertEntry,
  countQueuedAhead,
  findQueuedForUpdate,
  markAdmitted,
  markPurchased,
};
