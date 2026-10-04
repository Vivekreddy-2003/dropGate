/**
 * 9.10 — Idempotency-Key header for POST /holds and POST /holds/:id/pay.
 */

const AppError = require('../../errors/AppError');
const idempotencyRepository = require('./idempotency.repository');

/**
 * @param {() => Promise<{ statusCode: number, body: object }>} run
 */
async function runIdempotent({ userId, route, idempotencyKey, run }) {
  if (!idempotencyKey) {
    const outcome = await run();
    return { ...outcome, replayed: false };
  }

  const existing = await idempotencyRepository.findStored(userId, route, idempotencyKey);
  if (existing) {
    return {
      statusCode: existing.status_code,
      body: existing.response_body,
      replayed: true,
    };
  }

  const outcome = await run();

  try {
    await idempotencyRepository.insertStored(undefined, {
      userId,
      route,
      key: idempotencyKey,
      statusCode: outcome.statusCode,
      responseBody: outcome.body,
    });
  } catch (err) {
    if (err.code === '23505') {
      const replay = await idempotencyRepository.findStored(userId, route, idempotencyKey);
      if (replay) {
        return {
          statusCode: replay.status_code,
          body: replay.response_body,
          replayed: true,
        };
      }
    }
    throw err;
  }

  return { ...outcome, replayed: false };
}

function getIdempotencyKey(req) {
  const raw = req.get('Idempotency-Key');
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 128) {
    throw new AppError('VALIDATION', 'Idempotency-Key must be 1–128 characters', 400);
  }
  return trimmed;
}

module.exports = {
  runIdempotent,
  getIdempotencyKey,
};
