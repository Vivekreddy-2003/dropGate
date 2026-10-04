const cors = require('cors');
const express = require('express');
const authRoutes = require('./modules/auth/auth.routes');
const errorHandler = require('./middleware/errorHandler');
const dropsRoutes = require('./modules/drops/drops.routes');
const holdsRoutes = require('./modules/holds/holds.routes');
const ordersRoutes = require('./modules/orders/order.routes');
const { isRedisReady } = require('./redis/client');
const app = express();

// Trust the proxy so req.ip is the real client IP behind nginx/load balancer —
// otherwise IP-based rate limiting would count everyone as the proxy's IP.
app.set('trust proxy', true);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    credentials: false,
  }),
);
app.use(express.json());

app.get('/health', (req, res) => {
  // Report Redis so you can see "degraded" mode at a glance. ok stays true even
  // when Redis is down — the API is still healthy, just without cache/limits.
  res.json({ ok: true, redis: isRedisReady() ? 'up' : 'down' });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/drops', dropsRoutes);
app.use('/api/v1/holds', holdsRoutes);
app.use('/api/v1/orders', ordersRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
});

app.use(errorHandler);

module.exports = app;
