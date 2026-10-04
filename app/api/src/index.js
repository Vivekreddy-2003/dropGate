const app = require('./app');
const config = require('./config');
const { connectRedis, closeRedis } = require('./redis/client');

async function start() {
  // Try Redis first, but never block the server on it. If it is down we log and
  // continue in degraded mode (no cache, rate limits fail-open).
  await connectRedis();

  const server = app.listen(config.port, () => {
    console.log(`Dropgate API listening on http://localhost:${config.port}`);
  });

  // Close Redis cleanly on shutdown so we don't leak the connection.
  async function shutdown(signal) {
    console.log(`\n[${signal}] shutting down...`);
    server.close();
    await closeRedis();
    process.exit(0);
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
