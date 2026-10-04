# Dropgate — Engineering Notes

*The **why** behind the design, and the transferable lessons learned building it.*
For **how the system fits together**, see [ARCHITECTURE.md](ARCHITECTURE.md).

Two parts:
- **Part A — Design decisions** (why it's built this way; ADR-style)
- **Part B — Lessons** (concepts worth carrying to any project)

---
---

# Part A — Design decisions

## A1. PostgreSQL is the single source of truth

**Decision:** stock (`skus.remaining_qty`), holds, and orders live in Postgres and
change only inside transactions. Nothing else is allowed to be the authoritative
copy.

**Why:** Dropgate's entire reason to exist is "never sell the same unit twice."
Correctness beats speed. Any store with weaker guarantees (a cache, an in-memory
counter) introduces a window where two readers both think a unit is free.

**Consequence:** the last-unit decision is one atomic
`UPDATE … WHERE remaining_qty >= qty` — the row lock serializes the race, and the
loser's `UPDATE` affects 0 rows → `409 SOLD_OUT`.

## A2. Redis scope — rate limit + cache only, never stock

**Decision:** Redis does exactly two jobs — a **shared rate-limit counter** and a
**read-through cache of the public drop page**. It is never the source of truth for
anything.

**Why:**
- Rate limiting needs **one counter shared across all API processes**; an in-memory
  counter silently breaks the moment you run more than one process.
- The drop page is a **hot read** at go-live; caching it protects the Postgres
  connections that the actual sales need.
- Stock must never live in Redis: losing or desyncing it means double-selling.

**The rule:** *if Redis disappears, the system gets slower, never wrong.* The client
is built **fail-open** — Redis down → cache always misses (straight to Postgres) and
rate limits allow everyone through. A Redis outage is a non-event.

## A3. RabbitMQ + outbox for post-pay side effects (planned)

**Decision:** after a payment commits, side effects (receipt email, merchant
webhook) are published via a **transactional outbox** → RabbitMQ → worker
consumers. They never run inside `POST /pay`.

**Why not inside the pay request:**
- **Atomicity:** writing an `outbox` row in the *same transaction* as the order
  guarantees "if the sale is real, the intent to notify exists" — exactly once. A
  direct Gmail call can't be rolled back; a crash loses or fabricates receipts.
- **Latency:** the buyer shouldn't wait on a mail server to see "done."
- **Failure isolation:** Gmail or the webhook being down must not fail a payment
  that already succeeded.
- **Retries belong to a worker, not an HTTP handler.**

**Why outbox *and* a queue:** publishing straight to RabbitMQ from the handler
reintroduces the dual-write problem (DB commit and publish are two systems). The
outbox makes it one atomic DB write; a separate worker does the retryable publish.

**Consequence:** consumers must be **idempotent** — at-least-once delivery means
duplicates are normal; two receipts for one order is a bug.

## A4. Payments — simulated by default; Stripe test-mode later (planned)

**Decision today:** payment is **simulated** — `POST /holds/:id/pay` writes a `paid`
or `failed` order with a fake `payment_ref` (`sim_<uuid>`), all inside the pay
transaction. This is correct scope for the project's goals (concurrency, schema,
tooling), not a missing feature.

**Decision when real:** integrate **Stripe in test mode** (free, no subscription),
behind a `PAYMENT_PROVIDER=simulated|stripe` flag, keeping the simulator as the
default so concurrency tests don't depend on a third party.

**The key shift to understand:** in the real world the **gateway**, not the client,
decides success — asynchronously, via a **webhook**:
```
POST /pay → create Stripe PaymentIntent, return client_secret   (hold stays 'held')
browser → confirms card directly with Stripe                     (server never sees the card)
Stripe → POST /webhooks/stripe (payment_intent.succeeded)        (THIS confirms the sale)
```
Confirming the sale moves **out of `POST /pay` into the webhook handler** — the same
async lesson as the outbox, on the inbound side. It reuses the existing idempotency
module (Stripe requires idempotency keys; webhooks can fire twice — dedupe by
`event.id`) and interacts with the hold TTL (the hold must outlive the payment
window; handle "webhook succeeds but hold already expired").

## A5. Other standing decisions

| Decision | Choice |
|---|---|
| Queue fairness | FIFO by `waiting_room_entries.position` |
| Hold vs order | separate tables; pay confirms the hold |
| Auth | stateless JWT; role (`merchant`/`shopper`) in the token |
| Architecture | monolith API + workers until scale demands a split |
| Idempotency | dedupe hold/pay so a double-submit is safe |

---
---

# Part B — Lessons worth keeping

## B1. The mental model: vault vs notepad

> **Postgres is the bank vault. Redis is the notepad on your desk.**

You never keep the only copy of money on a sticky note, but you happily jot a
running tally there to save trips to the vault. The one-line test for *anything*:

> **If this vanished, is my system slower or wrong?**
> Slower → Redis is fine. Wrong → it belongs in Postgres.

## B2. Rate limiting (Redis job #1)

**The problem it solves:** a limiter is only correct if **every API process shares
one counter.** An in-memory `Map` works on your laptop and silently becomes
"limit × N processes" in production.

**Algorithm (fixed window):**
```
key = rl:<name>:<id>:<time-bucket>
n   = INCR key                 # atomic on the server → safe across processes
if n == 1: EXPIRE key <window> # window cleans itself up
if n  > max: 429               # route logic never runs
```
`INCR` being atomic is the whole point — two processes incrementing at the same
instant can't both read "1." No lost updates.

**Two identifier strategies (a real decision):**
- **login → by IP.** Caller isn't logged in yet; IP is all we have. Stops
  brute-force / credential stuffing (each attempt is a *different password guess*).
- **join → by user id.** Request is authenticated, so per-user is fairer and
  **NAT-proof** — a dorm/office/carrier shares one IP; keying by IP would lock real
  users out of each other's budget.

**Rule:** *rate-limit by the most specific identity you have at that point.*

**Fail-open vs fail-closed** is a policy choice — write it down. Dropgate fails
**open** (availability > strict limiting). A bank login might fail closed.

**login vs join — same tool, different reason it trips:**
| | login | join |
|---|---|---|
| What repeats | a *different* password | the *same* request |
| Does repeating help the caller? | maybe (a guess could be right) | no — join is idempotent |
| The limit protects | your **accounts** (stop break-ins) | your **server** (stop no-op floods) |

## B3. Caching (Redis job #2)

**Read-through pattern:**
```
getDropBySlug(slug):
  1. GET drop:slug:<slug>        # hit → return, SKIP Postgres
  2. miss → read Postgres
  3. SET drop:slug:<slug> <json> EX 10   # populate for next reader
```

**Invalidation** (the genuinely hard part): `DEL` the key on writes that change the
page (schedule, go-live). Two rules learned:
- **Invalidate *after* the transaction commits**, never inside it — if the txn rolls
  back you'd have thrown away a valid entry for a change that never happened.
- **TTL is the safety net** — even if you forget to invalidate, a stale page can
  only live `EX` seconds.

**The subtle one — stale stock is fine, on purpose.** The cached page includes
`remainingQty`, which can be a few seconds stale. That's acceptable because the
number on the page is a **display hint**, not a promise. The *sale* is decided by
the atomic `UPDATE … WHERE remaining_qty >= 1` against Postgres. So a shopper can
see "1 left," click, and correctly get `409 SOLD_OUT`.

> **Never let a cache make the sale decision.** The single most important sentence.

## B4. Rate limiting vs idempotency — don't confuse them

Clicking join 50× triggers **two different nets that do opposite things:**

| Clicks within the limit | Clicks past the limit |
|---|---|
| **Postgres / idempotency** handles it | **Redis / rate limit** handles it |
| **same** result (position 7, one row) | **different** result (`429`) |
| protects **data correctness** | protects the **server** |

- **Idempotency (Postgres):** the join service checks "does `(drop,user)` already
  have an entry?" → returns it; a unique constraint is the hard backstop.
- **Rate limit (Redis):** counts and returns `429` after max, skipping the route.

You need both: idempotency alone still lets a spammer run 10,000 pointless
transactions; rate limit alone could let a double-click create a duplicate row.

## B5. The server never trusts the client

> Anything the browser does — moving screens, hiding buttons, disabling clicks — is
> a *suggestion*, not a guarantee. The server defends itself as if the UI doesn't
> exist.

"If clicking join navigates you away, when do you click it twice?" — the rate limit
protects the **endpoint**, not the button:
1. **Network lag** — the screen only moves *after* the response; impatient users
   double/triple-click during the wait.
2. **No UI at all** — `POST /drops/:id/waiting-room` is just a URL; a bot/curl/script
   hits it in a loop, never rendering your React app. (This is who the limit is for.)
3. **Buggy/retrying frontend.**

The UI flow protects honest users; the server-side limit + idempotency protect
against everyone else.

## B6. Redis commands used (and why)

| Command | Used for | Why |
|---|---|---|
| `SET key val EX n` / `GET` | cache write-with-TTL / read | atomic set-with-expiry in one call |
| `DEL` | cache invalidation | drop a stale key on write |
| `INCR` | rate-limit counter | **atomic** → safe across processes |
| `EXPIRE` | window reset | counter key self-cleans |
| `TTL` | debugging | how long a key has left |
| `--scan --pattern` | debugging | list keys without blocking (never `KEYS` in prod) |
| `MONITOR` | learning | live stream of every command (dev only) |

## B7. When to use Redis — and when NOT

**Use it when you can say "yes, because…":**
- many processes must share one counter/flag → rate limit
- a hot read barely changes → cache (with TTL + invalidation)
- data should auto-expire → sessions, OTPs, short locks (TTL)
- ranked data updated constantly → sorted sets / leaderboards

**Do NOT use it when:**
- losing the data makes the system *wrong*, not just slow → Postgres
- you haven't measured the read being slow → don't cache yet
- one process is enough → a plain in-memory value may do
- you need guaranteed, retryable delivery → that's a durable queue (RabbitMQ +
  outbox), **not** Redis pub/sub

## B8. How to run & inspect Redis

```bash
# start Redis
docker run -d --name dg-redis -p 6379:6379 redis:7
docker exec dg-redis redis-cli ping            # → PONG

# set REDIS_URL in app/api/.env, then restart the API → logs "[redis] connected"
# /health reports {"ok":true,"redis":"up"}  (or "down" in degraded mode)

# watch it live
docker exec -it dg-redis redis-cli
> --scan --pattern 'rl:*'          # rate-limit counters
> --scan --pattern 'drop:slug:*'   # cached pages
> TTL drop:slug:<slug>             # watch it count down from 10
> MONITOR                          # every command in real time (dev only)

# GUI option: RedisInsight
docker run -d --name dg-redisinsight -p 5540:5540 redis/redisinsight:latest
# open http://localhost:5540, connect to localhost:6379
```

**Flow logs in the terminal** (added to the code for learning): watch a request
narrate itself —
```
[flow] ▶ GET drop by slug="friday-hoodie" — checking cache first...
[cache] 🔴 MISS → will read Postgres, then populate cache
[cache] 💾 SET  ttl=10s (next read will HIT)
[cache] 🟢 HIT → returning cached JSON, SKIPPING Postgres
[cache] 🧹 INVALIDATE → next read will MISS & re-read Postgres
[rate-limit:login] ✅ ALLOW count=1/5 → next()
[rate-limit:login] 🚫 BLOCK count=6/5 → 429 (route skipped)
```

**The browser never touches Redis.** It speaks HTTP to the API; the API talks to
Redis and Postgres on a private network. Letting the browser reach Redis would be a
security hole (no app-level auth) and a protocol mismatch (browsers speak HTTP).

---

## The whole Redis topic in six sentences

1. Redis is a **bouncer and a notepad**, never the vault — Postgres is the vault.
2. On login/join it only **counts requests per caller and blocks past a max**; the
   real work is pure Postgres.
3. login keys the counter by **IP**, join by **user id** — the only real difference.
4. "Same result on repeat clicks" is **idempotency in Postgres**, a *different* thing
   from the rate limit.
5. The rate limit guards the **endpoint**, not the UI button — the server never
   trusts the client.
6. The browser never touches Redis; you inspect it with RedisInsight or redis-cli.
