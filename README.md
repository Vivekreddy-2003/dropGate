# Dropgate

A fair-launch drop platform: a merchant schedules a limited release, shoppers wait
in a queue, reserve a unit for a few minutes, then pay — and the system **never
sells the same unit twice**, even when two people click Buy at the same instant.

---

## The idea

Think of a hyped sneaker or GPU drop: hundreds of people, a handful of units, one
exact go-live time. The hard part isn't the catalog or the checkout — it's the
**last unit**. Two shoppers race for it; exactly one must win, and the other must
cleanly see "sold out." An ordinary store can shrug and say "sorry, we oversold" —
Dropgate can't. That single constraint drives the whole design: a waiting room for
fairness, time-boxed holds so stock isn't locked forever, and atomic database
transactions so the winner is decided by Postgres, not by who has the faster phone.

## Scope

**In scope**
- Merchant: create a drop + SKU, schedule it, go live, watch live stats.
- Shopper: register/login, join a drop's waiting room, get admitted in FIFO batches,
  reserve a unit (time-boxed hold), pay, see the order.
- Correctness: atomic last-unit reservation, hold expiry returning stock to the next
  person in line, idempotent join/pay.
- Performance/abuse: Redis rate limiting (login, join) and a cached public drop page.

**Out of scope (on purpose)**
- Not a full storefront (no catalog, coupons, reviews, carts across brands).
- Not pixel-for-pixel Ticketmaster.
- Real card processing is stubbed today (simulated payment with a fake
  `payment_ref`); a Stripe test-mode, webhook-driven flow is planned.

## Key features

| Feature | What it does |
|---|---|
| Waiting room | FIFO queue per drop; admit in batches at go-live |
| Time-boxed holds | reserve a unit for N minutes; expiry returns it to the next in line |
| Last-unit safety | atomic `UPDATE … WHERE remaining_qty >= qty` — one winner, one `409 SOLD_OUT` |
| Simulated pay | hold → confirmed order, stock finalized, drop flips to `sold_out` |
| Idempotency | double-submitted join/pay can't create duplicates |
| Redis rate limiting | shared counter stops brute-force login / join floods across all API processes |
| Redis caching | hot public drop page served from cache; Postgres stays the source of truth |

## Tech stack

- **Backend:** Node.js, Express, PostgreSQL (via Knex), JWT auth
- **Cache / rate limit:** Redis (ioredis) — optional; the API runs degraded without it
- **Frontend:** React (Vite)
- **Planned:** RabbitMQ + transactional outbox (async email/webhooks), Stripe (test mode), Docker Compose + CI

---

## Running locally

### Prerequisites
- Node.js ≥ 20
- PostgreSQL (local install or Docker)
- Redis — optional; without it, caching and rate limiting are skipped (the app still
  works, just slower and unthrottled)

### 1. Backend API

```bash
cd app/api
npm install
cp .env.example .env            # then edit DATABASE_URL, JWT_SECRET, REDIS_URL

npm run db:migrate              # create the schema on an empty database

npm run dev                     # http://localhost:3000  (nodemon)
```

Optional Redis (enables cache + rate limiting):

```bash
docker run -d --name dg-redis -p 6379:6379 redis:7
# then (re)start the API — logs "[redis] connected"; GET /health shows {"redis":"up"}
```

### 2. Frontend

```bash
cd app/web
npm install
cp .env.example .env            # point it at the API (http://localhost:3000)
npm run dev                     # http://localhost:5173
```

### Tests

```bash
cd app/api
npm test                        # includes the concurrent last-unit test
```

---

## Project structure

```
my-project/
├── app/
│   ├── api/        ← Node/Express backend (modules: auth, drops, waiting-room, holds, orders)
│   │   ├── db/migrations/
│   │   └── src/    ← routes → controllers → services → repositories → Postgres
│   └── web/        ← React (Vite) frontend
└── docs/
    ├── ARCHITECTURE.md        ← how the system works (flows, data model, states, API)
    └── ENGINEERING-NOTES.md   ← why it's built this way + lessons (Redis, idempotency, caching)
```

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — product overview, system architecture,
  data model, state machines, and the end-to-end feature flows (including the last-unit race).
- **[docs/ENGINEERING-NOTES.md](docs/ENGINEERING-NOTES.md)** — design decisions (Postgres as
  source of truth, Redis scope, outbox/queue, payments) and the engineering lessons behind them.

## Status

Backend (auth, drops, waiting room, holds, atomic stock, simulated pay, idempotency,
Redis cache + rate limiting) is built. React UI is in progress. RabbitMQ/outbox,
real Stripe payments, and Docker/CI are planned — see the architecture doc's status
table.
