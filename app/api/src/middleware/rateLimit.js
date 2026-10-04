/**
 * RATE LIMIT MIDDLEWARE (Category F — Redis job #2: a shared counter)
 *
 * Why Redis and not an in-memory Map? Run the API as two processes (pm2 /
 * containers / autoscaling) and an in-memory counter silently fails: each
 * process counts only its own traffic, so the real limit becomes N × max. A
 * limiter is only correct if every process reads and writes ONE shared counter.
 * That shared, atomic counter is exactly what Redis is great at.
 *
 * Algorithm: FIXED WINDOW.
 *   key = rl:<name>:<identifier>:<windowBucket>
 *   n   = INCR key          (atomic; first caller creates it at 1)
 *   if n === 1: EXPIRE key windowSeconds   (so the window resets itself)
 *   if n  >  max: reject with 429
 *
 * INCR is atomic on the Redis server, so two processes incrementing at the same
 * instant can never both read "1" — no lost updates, no double-count. That
 * atomicity is the whole reason this works across processes.
 *
 * FAIL-OPEN: if Redis is down we ALLOW the request. For a boutique drop site,
 * availability beats strict limiting; losing the limiter must not lock everyone
 * out. (A bank login might choose fail-CLOSED instead — that is a policy call,
 * documented in docs/adr/0001. Flip the `else` branch to change it.)
 */

const { redis, isRedisReady } = require('../redis/client');

/**
 * @param {object} opts
 * @param {string} opts.name   short label for the key namespace, e.g. 'login'
 * @param {number} opts.max    max requests allowed per window
 * @param {number} opts.windowSeconds  window length in seconds
 * @param {(req) => string} [opts.identifier]  what we count per. Default: IP.
 */
function rateLimit({ name, max, windowSeconds, identifier }) {
  const getId = identifier || ((req) => req.ip || 'unknown');

  return async function rateLimitMiddleware(req, res, next) {
    // Degraded mode: no Redis → do not block anyone.
    if (!isRedisReady()) {
      console.log(`[rate-limit:${name}] ⚠️  Redis down → SKIP (fail-open, allowing request)`);
      return next();
    }

    try {
      const id = getId(req);
      // Bucket the timestamp so each window gets its own key that expires on its
      // own. Simpler and more robust than resetting one shared key.
      const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
      const key = `rl:${name}:${id}:${bucket}`;

      const count = await redis.incr(key);
      if (count === 1) {
        // First hit in this window — set the TTL so the key cleans itself up.
        await redis.expire(key, windowSeconds);
      }

      // Helpful headers so clients (and you, debugging) can see the budget.
      const remaining = Math.max(0, max - count);
      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Remaining', String(remaining));

      if (count > max) {
        console.log(
          `[rate-limit:${name}] 🚫 BLOCK id=${id} count=${count}/${max} → 429 (route skipped)`,
        );
        res.set('Retry-After', String(windowSeconds));
        return res.status(429).json({
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests, slow down and try again shortly.',
          },
        });
      }

      console.log(
        `[rate-limit:${name}] ✅ ALLOW id=${id} count=${count}/${max} (remaining=${remaining}) → next()`,
      );
      return next();
    } catch (err) {
      // Redis hiccupped mid-request — fail open, never block a real user.
      console.warn(`[rateLimit:${name}] error, allowing request:`, err.message);
      return next();
    }
  };
}

module.exports = rateLimit;
