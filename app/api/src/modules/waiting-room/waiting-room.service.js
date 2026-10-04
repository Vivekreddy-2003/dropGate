/**
 * WAITING ROOM SERVICE
 */

const db = require('../../db/knex');
const AppError = require('../../errors/AppError');
const dropsRepository = require('../drops/drops.repository');
const waitingRoomRepository = require('./waiting-room.repository');

function toEntryPayload(row) {
  return {
    position: row.position,
    status: row.status,
    admittedAt: row.admitted_at ?? null,
  };
}

async function buildMeResponse(entry) {
  const aheadCount = await waitingRoomRepository.countQueuedAhead(
    entry.drop_id,
    entry.position,
  );
  return {
    entry: toEntryPayload(entry),
    aheadCount,
  };
}

/**
 * @param {string} dropId
 * @param {string} userId
 */
async function joinWaitingRoom(dropId, userId) {
  const drop = await dropsRepository.findById(dropId);
  if (!drop) {
    throw new AppError('NOT_FOUND', 'Drop not found', 404);
  }

  const now = new Date();
  if (now < new Date(drop.registration_opens_at)) {
    throw new AppError('FORBIDDEN', 'Waiting room is not open yet', 403);
  }

  if (!['scheduled', 'live'].includes(drop.status)) {
    throw new AppError('CONFLICT', 'Cannot join waiting room for this drop', 409);
  }

  const existing = await waitingRoomRepository.findEntryByDropAndUser(dropId, userId);
  if (existing) {
    return buildMeResponse(existing);
  }

  return db.transaction(async (trx) => {
    const existingInTx = await waitingRoomRepository.findEntryByDropAndUser(
      dropId,
      userId,
      trx,
    );
    if (existingInTx) {
      return buildMeResponse(existingInTx);
    }

    const maxPos = await waitingRoomRepository.getMaxPosition(trx, dropId);
    const nextPosition = maxPos + 1;
    const row = await waitingRoomRepository.insertEntry(trx, {
      dropId,
      userId,
      position: nextPosition,
    });
    return buildMeResponse(row);
  });
}

/**
 * GET waiting-room/me (08-01, 08-02)
 */
async function getMyEntry(dropId, userId) {
  const entry = await waitingRoomRepository.findEntryByDropAndUser(dropId, userId);
  if (!entry) {
    throw new AppError(
      'NOT_FOUND',
      'You are not in the waiting room for this drop',
      404,
    );
  }
  return buildMeResponse(entry);
}

async function admitNext(dropId, trx) {
  const run = async (t) => {
    const drop = await dropsRepository.findById(dropId, t);
    if (!drop || drop.status !== 'live') {
      return { admittedCount: 0 };
    }

    const batch = drop.admit_batch_size;
    const entries = await waitingRoomRepository.findQueuedForUpdate(t, dropId, batch);
    if (entries.length === 0) {
      return { admittedCount: 0 };
    }

    const entryIds = entries.map((e) => e.id);
    const admittedAt = new Date();
    await waitingRoomRepository.markAdmitted(t, entryIds, { admittedAt });

    return { admittedCount: entries.length };
  };

  if (trx) {
    return run(trx);
  }
  return db.transaction(run);
}

module.exports = {
  joinWaitingRoom,
  getMyEntry,
  admitNext,
};
