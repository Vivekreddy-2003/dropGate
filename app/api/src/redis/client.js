/**
 * REDIS CLIENT (Category F)
 *
 * One shared connection for the whole API process. Everything that touches
 * Redis — the rate limiter and the drop-page cache — imports `redis` from here.
 *
 * Design rule from docs/adr/0001: Redis is a SPEED layer, never the source of
 * truth. So this client is built to FAIL FAST and FAIL OPEN:
 *
 *   - `lazyConnect: true`      → we connect explicitly at boot; the module can
 *                                be required even when Redis is absent.
 *   - `enableOfflineQueue:false` → if Redis is down, commands reject immediately
 *                                instead of buffering forever. Callers catch the
 *                                error and continue (cache miss / allow request),
 *                                so a Redis outage makes us slower, not broken.
 *   - `maxRetriesPerRequest: 1`  → don't hang a shopper's HTTP request retrying
 *                                a dead socket.
 *
 * We deliberately do NOT crash the process when Redis is unreachable. Compare
 * this to db/knex.js: Postgres being down IS fatal (no truth = no app); Redis
 * being down is not.
 */

const Redis = require('ioredis');
const config = require('../config');

const redis = new Redis(config.redis.url, {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  // Cap reconnect backoff so a long outage doesn't spin hard.
  retryStrategy: (times) => Math.min(times * 200, 2000),
});

let ready = false;

redis.on('ready', () => {
  ready = true;
  console.log('[redis] connected');
});

redis.on('end', () => {
  ready = false;
});

// Without a listener, ioredis emits 'error' as an unhandled exception and can
// crash the process — exactly what we are trying to avoid. Log once and move on.
redis.on('error', (err) => {
  if (ready) {
    // Only noisy-log the first failure after a healthy period.
    console.warn('[redis] connection error:', err.message);
  }
  ready = false;
});

/**
 * Attempt to connect at boot. Never throws: if Redis is unavailable we log and
 * continue in degraded mode. Returns true if connected.
 */
async function connectRedis() {
  if (!config.redis.url) {
    console.warn('[redis] REDIS_URL not set — running without cache/rate-limit');
    return false;
  }
  try {
    await redis.connect();
    return true;
  } catch (err) {
    console.warn(
      `[redis] could not connect (${err.message}) — running degraded (no cache, rate limits fail-open)`,
    );
    return false;
  }
}

/** True only when the socket is up and commands will actually run. */
function isRedisReady() {
  return ready && redis.status === 'ready';
}

async function closeRedis() {
  try {
    await redis.quit();
  } catch {
    // ignore — we're shutting down
  }
}

module.exports = { redis, connectRedis, isRedisReady, closeRedis };
