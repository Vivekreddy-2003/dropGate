/**
 * DROP PAGE CACHE (Category F — Redis job #1: cache a hot read)
 *
 * The public drop page (GET /drops/slug/:slug) is a hot read: at go-live a crowd
 * requests the same slug within seconds. We cache the exact JSON the service
 * returns, keyed by slug, with a short TTL.
 *
 * Pattern: READ-THROUGH cache.
 *   1. Try Redis (GET). Hit → return it, skip Postgres.
 *   2. Miss → caller reads Postgres, then calls set() to populate Redis.
 *   3. On any merchant write that changes the page → invalidate() (DEL).
 *
 * FAIL-OPEN: every function swallows Redis errors. A cache that is down must
 * never break a read — it just turns into "always a miss" (straight to Postgres,
 * i.e. slower, not wrong). This is the docs/adr/0001 principle in code.
 *
 * IMPORTANT: the cached payload includes skus[].remainingQty. That number is a
 * DISPLAY value and may be a few seconds stale (bounded by the TTL). It is NOT
 * used to decide the sale — the hold/pay path reads remaining_qty fresh inside a
 * Postgres transaction. Never trust this cache for stock math.
 */

const config = require('../config');
const { redis, isRedisReady } = require('../redis/client');

const TTL_SECONDS = config.redis.dropCacheTtlSeconds;

function keyForSlug(slug) {
  return `drop:slug:${slug}`;
}

/** Returns the cached payload object, or null on miss / Redis down. */
async function getCachedDrop(slug) {
  if (!isRedisReady()) {
    console.log(`[cache] ⚠️  Redis down → MISS (will read Postgres) slug=${slug}`);
    return null;
  }
  try {
    const key = keyForSlug(slug);
    const raw = await redis.get(key);
    if (raw) {
      console.log(`[cache] 🟢 HIT  key=${key} → returning cached JSON, SKIPPING Postgres`);
      return JSON.parse(raw);
    }
    console.log(`[cache] 🔴 MISS key=${key} → will read Postgres, then populate cache`);
    return null;
  } catch (err) {
    console.warn('[cache] get failed, treating as MISS:', err.message);
    return null;
  }
}

/** Store the payload under the slug with a short TTL. Best-effort. */
async function setCachedDrop(slug, payload) {
  if (!isRedisReady()) return;
  try {
    // SET key value EX <ttl> — value auto-expires, so even if we forget to
    // invalidate, the stale page can only live TTL_SECONDS.
    const key = keyForSlug(slug);
    await redis.set(key, JSON.stringify(payload), 'EX', TTL_SECONDS);
    console.log(`[cache] 💾 SET  key=${key} ttl=${TTL_SECONDS}s (next read will HIT)`);
  } catch (err) {
    console.warn('[cache] set failed, skipping cache:', err.message);
  }
}

/** Remove a slug from cache after a write that changed it. Best-effort. */
async function invalidateDrop(slug) {
  if (!slug || !isRedisReady()) return;
  try {
    const key = keyForSlug(slug);
    const deleted = await redis.del(key);
    console.log(
      `[cache] 🧹 INVALIDATE key=${key} (deleted=${deleted}) → next read will MISS & re-read Postgres`,
    );
  } catch (err) {
    console.warn('[cache] invalidate failed:', err.message);
  }
}

module.exports = { getCachedDrop, setCachedDrop, invalidateDrop };
