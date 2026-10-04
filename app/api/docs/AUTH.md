# Authentication boilerplate

Routes (base URL `http://localhost:3000`):

| Method | Path | Auth | Body |
|---|---|---|---|
| POST | `/api/v1/auth/register` | No | `{ "email", "password", "role": "shopper" \| "merchant" }` |
| POST | `/api/v1/auth/login` | No | `{ "email", "password" }` |
| GET | `/api/v1/auth/me` | Bearer JWT | — |

## Flow

1. **Register** — password hashed with bcrypt → row in `users` → JWT returned.
2. **Login** — compare password → JWT returned.
3. **Me** — send header `Authorization: Bearer <token>` → current user (no password).

JWT payload: `{ sub: userId, role }`. Signed with `JWT_SECRET` from `.env`.

## Run

```bash
cd app/api
npm install
npm run dev
```

## curl examples

```bash
# Register merchant
curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"maya@drop.test","password":"password123","role":"merchant"}'

# Login
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"maya@drop.test","password":"password123"}'

# Me (replace TOKEN)
curl -s http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer TOKEN"
```

## Files (read in this order)

```
src/modules/auth/
  auth.validation.js   ← Zod: what body must look like
  auth.repository.js   ← Knex: users table
  auth.service.js      ← register / login / getMe rules
  auth.controller.js   ← HTTP in/out
  auth.routes.js       ← wires URLs to controller
src/middleware/auth.js ← JWT on protected routes
```

Category B drops/waiting-room routes will reuse `authenticate` and `requireRole('merchant')`.
