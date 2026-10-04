# Dropgate — Architecture & Flow

*How the system works: what it is, how the pieces fit, and the end-to-end flows.*
For **why** it's built this way and the engineering lessons, see
[ENGINEERING-NOTES.md](ENGINEERING-NOTES.md).

---

## 1. What Dropgate is

A website where a brand sells a **tiny number of items at a set time**, and the
system must be **fair** and **never sell the same unit twice**.

It's "just a website" — React frontend, Node/Express API, PostgreSQL — but with
one hard rule that makes it a real system-design problem: **the last unit.** Two
people click Buy at the same instant; exactly **one** must win. That single
constraint is the reason the schema, transactions, and queue exist.

### The three jobs the product must do

1. **Line** — too many people, few units → a **waiting room**, then a few are let
   in (admitted) at a time.
2. **Hold** — for a few minutes the unit is yours; if you don't pay, it goes back.
3. **Pay** — after payment it's sold. Email/webhooks happen **after**, never inside
   the pay click.

### The story it models (keep this in your head)

Maya (merchant) lists 2 hoodies, go-live Friday 10:00, 10-minute holds. Five
shoppers queue (Arun #1 … Esha #5). At go-live only 2 are admitted. Arun reserves
→ remaining 1. Bina reserves → remaining 0. Arun pays (sold). Bina doesn't pay →
hold expires → stock returns → Chetna admitted. Chetna and Dev both smash Reserve
on the last unit → **one wins, one gets SOLD_OUT.** Every table in the schema
exists only to remember this story.

---

## 2. System architecture

```
Browser (React SPA)
   │  HTTP (JSON, JWT)
   ▼
Express API ──────► PostgreSQL   (source of truth: stock, holds, orders)
   ├────────────► Redis          (rate limit + drop-page cache — speed only)
   └────────────► RabbitMQ       (planned: async email/webhooks via outbox)
```

**Guiding principle:** PostgreSQL is the **source of truth** for inventory and
orders. Redis is a speed layer (hot reads + shared counters), never the only copy
of stock. Side effects (email, webhooks) run **after** payment commits, not inside
the pay HTTP handler.

---

## 3. Repository layout

```
my-project/
├── docs/                 ← this file + ENGINEERING-NOTES.md
├── app/
│   ├── api/              ← Node/Express backend
│   │   ├── knexfile.js
│   │   ├── db/migrations/
│   │   └── src/
│   │       ├── index.js          ← server entry (boot, Redis connect, shutdown)
│   │       ├── app.js            ← Express app, route mounts, /health
│   │       ├── config/           ← env config (incl. redis block)
│   │       ├── middleware/       ← auth (JWT), requireRole, rateLimit, errorHandler
│   │       ├── redis/            ← shared Redis client (fail-open)
│   │       ├── cache/            ← drop-page read-through cache
│   │       ├── errors/           ← AppError
│   │       ├── db/knex.js
│   │       └── modules/          ← one folder per domain
│   │           ├── auth/         (register, login, me, JWT)
│   │           ├── drops/        (create, list, by-slug, schedule, go-live, admin)
│   │           ├── waiting-room/ (join, my-entry, admitNext)
│   │           ├── holds/        (reserve, pay, cancel, expire)
│   │           ├── orders/       (simulated payment, order read)
│   │           └── idempotency/  (dedupe hold/pay)
│   └── web/              ← React (Vite) frontend
└── README.md            ← what it is + how to run
```

---

## 4. Backend layering (every request)

```
HTTP Request
  → Route        URL + method; attach middleware (JWT, role, rate limit)
  → Controller   parse body/params; set status codes; NO business rules
  → Service      rules, state machines, TRANSACTIONS, "last unit" logic
  → Repository   Knex queries only
  → PostgreSQL
```

**Rules that never bend:**
- Controllers never run SQL and never decrement stock.
- **Services own transactions** and the last-unit logic.
- One module per domain. Repositories are the only place raw queries live.

---

## 5. Data model

### Entities

| Entity | Meaning | Key fields |
|---|---|---|
| `users` | A person who logs in; role `merchant` or `shopper` | email, password_hash, role |
| `drops` | One launch event | merchant_id, slug, status, registration_opens_at, goes_live_at, hold_ttl_seconds, max_per_user, admit_batch_size |
| `skus` | The sellable item; **stock lives here** | drop_id, price_cents, total_qty, **remaining_qty** |
| `waiting_room_entries` | One ticket per user per drop | drop_id, user_id, position, status |
| `holds` | A timed reservation | user_id, sku_id, drop_id, qty, expires_at, status |
| `orders` | A payment result; 1:1 with a paid hold | hold_id (unique), user_id, sku_id, amount_cents, status, payment_ref, paid_at |
| `inventory_movements` | Append-only stock log (−1 hold, +1 expire) | sku_id, delta, reason |
| `audit_events` | Who did what (merchant go-live, etc.) | actor user_id, action |

### Relationships

```
users 1─* drops            (merchant creates)
users 1─* waiting_room_entries
users 1─* holds
users 1─* orders
drops 1─* skus             (stock counted per SKU — sizes later)
drops 1─* waiting_room_entries
skus  1─* holds
holds 1─0..1 orders        (one paid order per hold)
skus  1─* inventory_movements
```

### Constraints that enforce correctness (the important part)

- **`skus.remaining_qty`** changed only via atomic
  `UPDATE … WHERE remaining_qty >= qty` inside a transaction — the anti-double-sell.
- **Unique `(drop_id, user_id)`** on `waiting_room_entries` — one place in line per
  person per drop (makes join idempotent).
- **Unique `hold_id`** on `orders` — a hold can become at most one paid order.
- **Three shopper steps = three tables:** in line (`waiting_room_entries`) →
  reserved (`holds`) → paid (`orders`). Hold = *maybe*; Order = *paid*. Mixing them
  is how systems double-sell.

---

## 6. State machines

```
Drop:    draft → scheduled → live → sold_out
                                  ↘ ended

Waiting: queued → admitted → purchased
 entry                    ↘ abandoned

Hold:    held → confirmed   (paid; do NOT reduce stock again)
         held → expired     (TTL; stock returns)
         held → released    (cancel; stock returns)

Order:   pending → paid
         pending → failed
```

**Stock rule:** decrement on **hold create**; increment on **expire/release**;
**no second decrement on pay** (the hold already reserved it).

| Drop status | Shoppers can… |
|---|---|
| `draft` | not see it |
| `scheduled` | join the queue; **not** checkout |
| `live` | be admitted + reserve |
| `sold_out` | nothing left (remaining 0 and no open holds) |
| `ended` | no new holds |

---

## 7. End-to-end flows

### Merchant

```
register (merchant) → login (JWT)
  → GET  /drops/mine           see all drops I created (any status) — the dashboard
  → POST /drops           create drop (+ sku), status draft
  → POST /drops/:id/schedule   draft → scheduled (shoppers may now queue)
  → POST /drops/:id/go-live    scheduled → live + admit first batch (FIFO)
  → GET  /drops/:id/admin      watch remaining, active holds, paid orders
```

A returning merchant hits `GET /drops/mine` to list everything they own (newest
first, drafts included) — this is what powers the merchant dashboard after login.

### Shopper

```
register (shopper) → login (JWT)
  → GET  /drops/slug/:slug          countdown, remaining (cached)
  → POST /drops/:id/waiting-room    join → position = MAX+1, status queued
  → poll GET /drops/:id/waiting-room/me   until status = admitted
  → POST /holds                     reserve: atomic remaining--, INSERT hold (held)
  → POST /holds/:id/pay             pay: hold → confirmed, order → paid, entry → purchased
  → GET  /orders/:id                confirmation
(if not paid in time: hold expires → stock returns → next queued admitted)
```

### The last-unit flow (the heart of Dropgate)

Two shoppers reserve when `remaining_qty = 1`, in parallel:

```
POST /holds  (both at once)
  BEGIN
  UPDATE skus SET remaining_qty = remaining_qty - 1
    WHERE id = ? AND remaining_qty >= 1
  → 1 row updated → INSERT hold → COMMIT → 201 (winner)
  → 0 rows updated → ROLLBACK      → 409 SOLD_OUT (loser)
```

**Never** read `remaining_qty` into app memory and then write it back — that race
is the double-sell bug. The database decides the winner, not whoever has the faster
phone. This lives in the **service**, inside a transaction.

### Hold expiry → next in line

```
Hold expires (on-read check or timer)
  BEGIN
    remaining_qty += qty
    hold.status = expired
    waiting_room entry → abandoned
    INSERT inventory_movement (+1, reason=expire)
    admitNext(dropId)   ← next queued entry → admitted
  COMMIT
```

### Why the waiting room exists

| Traffic | Cost | Who |
|---|---|---|
| Join + poll queue | cheap reads/writes; scales to big crowds | everyone |
| Reserve + pay | heavy; serializes on the SKU row | only **admitted** batch |

Everyone waits in the room; only `admit_batch_size` users may checkout at a time.
This is the "virtual waiting room" pattern — not "everyone clicks Buy and hits
out-of-stock."

### Rate limiting (where Redis sits on login & join)

A shared Redis counter sits in **front of** the endpoint; it only counts and blocks,
it never does the real work.

```
POST /auth/login                          POST /drops/:id/waiting-room
  → rateLimit (Redis INCR, key by IP)       → authenticate → requireRole
      count > max? → 429, stop              → rateLimit (Redis INCR, key by user id)
  → controller: Postgres + bcrypt → JWT         count > max? → 429, stop
                                            → controller: Postgres queue insert
```

login keys by **IP** (caller isn't logged in yet); join keys by **user id**
(authenticated, and fair behind shared/NAT IPs). If Redis is down, the limiter
**fails open** (allows the request). See ENGINEERING-NOTES §B2.

### Caching (where Redis sits on the drop page)

```
GET /drops/slug/:slug
  → GET drop:slug:<slug> from Redis
      HIT  → return cached JSON (skip Postgres)
      MISS → read Postgres → SET cache (EX 10s) → return
  (merchant schedule / go-live → DEL the key, after the txn commits)
```

The cached `remainingQty` is a display hint and may be seconds stale — the **sale**
is always decided against Postgres, never the cache. See ENGINEERING-NOTES §B3.

---

## 8. API map (base `/api/v1`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | — | liveness + Redis status |
| POST | `/auth/register` | — | create user |
| POST | `/auth/login` | — (rate-limited) | returns JWT |
| GET | `/auth/me` | JWT | current user |
| POST | `/drops` | merchant | create drop + sku |
| GET | `/drops` | public | list visible drops |
| GET | `/drops/mine` | merchant | **this merchant's own drops** (any status, incl. draft) + stock summary |
| GET | `/drops/slug/:slug` | public (cached) | drop detail + skus |
| GET | `/drops/:id/admin` | merchant | stats snapshot |
| POST | `/drops/:id/schedule` | merchant | draft → scheduled |
| POST | `/drops/:id/go-live` | merchant | scheduled → live + admitNext |
| POST | `/drops/:id/waiting-room` | shopper (rate-limited) | join queue |
| GET | `/drops/:id/waiting-room/me` | shopper | my position/status |
| POST | `/holds` | shopper | reserve (atomic) |
| POST | `/holds/:id/pay` | shopper | simulate pay |
| POST | `/holds/:id/cancel` | shopper | release hold |
| GET | `/holds/:id` | shopper | hold (expires on read) |
| GET | `/orders/:id` | shopper | confirmation |

Error shape (consistent everywhere):
`{ "error": { "code": "SOLD_OUT", "message": "..." } }`

---

## 9. Frontend (React / Vite)

Pages only display API state; the server owns all rules.

| Screen | Route | Behavior |
|---|---|---|
| Login / Register | `/login` | store JWT |
| Live drops | `/` | list drops, countdown |
| Drop detail | `/d/:slug` | countdown, Join CTA |
| Waiting room | `/d/:slug/queue` | poll position every 1–2s |
| Checkout | `/d/:slug/checkout` | hold timer, Reserve, Pay |
| Confirmation | `/orders/:id` | paid state, order id |
| Merchant create | `/merchant/drops/new` | create drop + SKU |
| Merchant control | `/merchant/drops/:id` | go-live, live stats |

The remaining number on the drop page **may lag** (it's cached); **checkout must
be exact** (reads/writes Postgres). See the caching note in ENGINEERING-NOTES.

---

## 10. Implementation status

| Area | State |
|---|---|
| Postgres schema + migrations | ✅ built |
| Auth (register/login/JWT/roles) | ✅ built |
| Drops, waiting room, go-live/admit | ✅ built |
| Holds, atomic stock, pay (simulated), expiry, cancel, idempotency | ✅ built |
| Redis: rate limit + drop-page cache | ✅ built |
| React shopper + merchant UI | 🔨 in progress |
| RabbitMQ + outbox (async email/webhooks) | ⬜ planned |
| Real payments (Stripe test-mode, webhook-driven) | ⬜ planned |
| Docker Compose + CI | ⬜ planned |

---

## 11. Demo script (the 5-person proof)

1. Merchant creates a drop: **2** units, **2-minute** hold, admit batch **2**.
2. Five shoppers join the waiting room (positions 1–5).
3. Merchant go-live → positions 1–2 admitted.
4. Shopper 1 reserves and pays.
5. Shopper 2 lets the hold expire → stock returns → shopper 3 admitted.
6. Two users fight for the last unit → exactly one `201`, one `409`.
