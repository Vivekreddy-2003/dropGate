require('dotenv').config();

const config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // Redis (Category F). Optional on purpose: if REDIS_URL is unset or Redis is
  // down, the API runs in "degraded" mode — slower, never wrong. See
  // docs/adr/0001 and docs/redis-implementation-notes.md.
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    // How long a cached public drop page lives before it must be re-read from
    // Postgres. Short on purpose: the cache is a speed layer, not the truth, so
    // a stale stock number self-heals within this many seconds.
    dropCacheTtlSeconds: Number(process.env.DROP_CACHE_TTL_SECONDS) || 10,
    // Fixed-window rate limits: "max requests per window (seconds)".
    rateLimit: {
      login: {
        max: Number(process.env.RATE_LIMIT_LOGIN_MAX) || 10,
        windowSeconds: Number(process.env.RATE_LIMIT_LOGIN_WINDOW) || 60,
      },
      join: {
        max: Number(process.env.RATE_LIMIT_JOIN_MAX) || 20,
        windowSeconds: Number(process.env.RATE_LIMIT_JOIN_WINDOW) || 60,
      },
    },
  },
};

if (!config.jwtSecret) {
  throw new Error('JWT_SECRET is required in .env');
}

module.exports = config;
