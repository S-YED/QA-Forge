# QAForge — Implementation Tickets: MVP-1C

Backend API Base (Express + Auth + Routes)

---

### TICKET-1C-01: Zod Environment Validation (env.ts)

**Status:** Done

**File:** `apps/api/src/config/env.ts`

**Description:** Implement fail-fast environment variable validation using Zod. The server must not start with invalid configuration.

**Key Implementation Details:**
- `schema.safeParse(process.env)` — non-throwing parse; logs formatted errors and calls `process.exit(1)` on failure
- `PORT: z.string().default('4000')` — string in schema, converted to `Number(data.PORT)` in export
- `CORS_ORIGIN: z.string().default('http://localhost:3000')` — split by comma in export: `data.CORS_ORIGIN.split(',').map(s => s.trim())` → `CORS_ORIGINS: string[]`
- `SUPABASE_URL: z.string().url()` — validates URL format
- `ENCRYPTION_KEY: z.string().length(64)` — enforces exactly 64 hex characters (32 bytes)
- `JWT_SECRET: z.string().min(32)` — minimum 32 characters
- `REDIS_URL: z.string().optional()` — optional; Redis is post-MVP
- Exported as `const env` with `as const` — immutable, fully typed

---

### TICKET-1C-02: Supabase Admin Client (supabase.ts)

**Status:** Done

**File:** `apps/api/src/config/supabase.ts`

**Description:** Create the Supabase service role client for backend use. This client bypasses Row-Level Security and must never be exposed to untrusted callers.

**Key Implementation Details:**
- `createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })` — server-side client; no token refresh or session persistence needed
- Re-exports `SupabaseClient` type for use in other modules
- Used by: `auth.middleware.ts`, `auth.routes.ts`, `projects.routes.ts`, `api-keys.routes.ts`, `socket-server.ts`

---

### TICKET-1C-03: Winston Logger (logger.ts)

**Status:** Done

**File:** `apps/api/src/utils/logger.ts`

**Description:** Create a structured logger with environment-appropriate formatting.

**Key Implementation Details:**
- Development: `combine(colorize(), simple())` — human-readable colored output
- Production: `combine(timestamp(), json())` — structured JSON for log aggregation services
- Log level: `debug` in development, `warn` in production
- Single `Console` transport — no file transport in MVP
- Default export: `logger` — imported as `import logger from './utils/logger.js'`

---

### TICKET-1C-04: AES-256-GCM Encryption Utility (encryption.ts + encryption.test.ts)

**Status:** Done

**Files:**
- `apps/api/src/utils/encryption.ts`
- `apps/api/src/utils/encryption.test.ts`

**Description:** Implement AES-256-GCM encryption/decryption for storing AI provider API keys. The implementation must be secure against IV reuse and ciphertext tampering.

**Key Implementation Details:**
- `encrypt(plaintext: string): string` — generates random 96-bit IV via `crypto.randomBytes(12)`; creates cipher with `aes-256-gcm`; returns `iv_hex:authTag_hex:ciphertext_hex`
- `decrypt(encrypted: string): string` — splits on `:`, validates 3 parts, sets auth tag via `decipher.setAuthTag(authTag)` **before** first `update()` call (required for GCM mode); throws `EncryptionError` on any failure
- `getKeyBuffer()` — converts `env.ENCRYPTION_KEY` (64-char hex) to 32-byte `Buffer` via `Buffer.from(key, 'hex')`
- `EncryptionError` class — custom error; raw crypto errors are never propagated to callers
- **Test script verifies:** round-trip correctness, IV randomness (same plaintext → different ciphertext), tampered ciphertext rejection (auth tag verification fails)

---

### TICKET-1C-05: AppError Class + Global Error Handler (error-handler.ts)

**Status:** Done

**File:** `apps/api/src/middleware/error-handler.ts`

**Description:** Implement a typed application error class and a global Express error handler that formats all errors consistently.

**Key Implementation Details:**
- `AppError` extends `Error` with `code: string`, `statusCode: number`, `details?: unknown`
- `Object.setPrototypeOf(this, new.target.prototype)` — maintains proper prototype chain for `instanceof` checks in ES5 targets
- Error codes: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `VALIDATION_ERROR` (400), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500)
- `errorHandler` function: 4-argument Express error handler (must be last middleware); logs with Winston; returns `{ error: { code, message, details } }` JSON; in production, non-`AppError` messages are redacted to `'An unexpected error occurred'`

---

### TICKET-1C-06: JWT Auth Middleware (auth.middleware.ts)

**Status:** Done

**File:** `apps/api/src/middleware/auth.middleware.ts`

**Description:** Implement the `authenticate` middleware that validates Supabase JWTs and attaches user context to every protected request.

**Key Implementation Details:**
- Extracts `Authorization: Bearer <token>` header; returns 401 if missing or malformed
- Calls `supabase.auth.getUser(token)` — **live network call** to Supabase Auth; detects revoked/expired tokens that would pass local JWT verification
- Fetches `profiles` row: `SELECT id, email, role FROM profiles WHERE id = data.user.id` — gets the user's role (not included in `auth.getUser()` response)
- Attaches `req.user = { id, email, role }` — available in all downstream route handlers
- Applied per-router in `app.ts` (not globally) — keeps `/api/health` unauthenticated

---

### TICKET-1C-07: Zod Request Validation Middleware (validation.ts)

**Status:** Done

**File:** `apps/api/src/middleware/validation.ts`

**Description:** Implement a reusable Zod validation middleware factory for validating request body, query parameters, and route parameters.

**Key Implementation Details:**
- `validate(schema: ZodSchema, target: 'body' | 'query' | 'params' = 'body')` — factory returns Express middleware
- On success: replaces `req[target]` with the parsed, coerced Zod output (e.g., string → number coercions applied)
- On failure: calls `next(new AppError('VALIDATION_ERROR', 400, 'Validation failed', result.error.format()))` — structured Zod error format in `details`
- Usage: `router.post('/', validate(MySchema), handler)` or `router.get('/:id', validate(ParamsSchema, 'params'), handler)`

---

### TICKET-1C-08: Rate Limiter Middleware (rate-limiter.ts)

**Status:** Done

**File:** `apps/api/src/middleware/rate-limiter.ts`

**Description:** Implement rate limiting middleware using `express-rate-limit`.

**Key Implementation Details:**
- `defaultLimiter`: 100 requests per 60-second window; applied globally in `app.ts`
- `aiLimiter`: 10 requests per 60-second window; reserved for AI-heavy routes in MVP-2+
- Both use `standardHeaders: true, legacyHeaders: false` — sends `RateLimit-*` headers per RFC 6585
- Custom `handler` calls `next(new AppError('RATE_LIMITED', 429, ...))` — routes through the global error handler for consistent JSON response format

---

### TICKET-1C-09: Express App Setup (app.ts)

**Status:** Done

**File:** `apps/api/src/app.ts`

**Description:** Assemble the Express application with all middleware and routes in the correct order.

**Key Implementation Details:**
- `express.json({ limit: '10mb' })` — 10MB limit for future context upload routes
- CORS: `origin` callback checks `env.CORS_ORIGINS` array; allows requests with no origin (server-to-server, curl); `credentials: true`
- Middleware order: body parser → CORS → rate limiter → health check → auth routes → projects routes → api-keys routes → 404 catch-all → error handler
- `authenticate` applied at router level in `app.use('/api/projects', authenticate, projectsRouter)` — not globally, to keep `/api/health` unauthenticated
- 404 handler returns `{ error: { code: 'NOT_FOUND', message: 'Route METHOD /path not found', details: null } }`

---

### TICKET-1C-10: HTTP Server + Socket.io Entry Point (index.ts)

**Status:** Done

**File:** `apps/api/src/index.ts`

**Description:** Create the application entry point that starts the HTTP server and attaches Socket.io.

**Key Implementation Details:**
- `import 'dotenv/config'` **must be the very first import** — before any local module is evaluated; if `config/env.ts` runs before dotenv, `process.env` is empty and Zod validation fails
- `http.createServer(app)` — wraps Express app in a Node.js HTTP server (required for Socket.io attachment)
- `server.listen(env.PORT, callback)` — starts listening before Socket.io is attached
- `createSocketServer(server)` — attaches Socket.io to the HTTP server
- Exports `io` for use in future route handlers that need to emit events

---

### TICKET-1C-11: Auth Routes GET/PUT /api/auth/me (auth.routes.ts)

**Status:** Done

**File:** `apps/api/src/routes/auth.routes.ts`

**Description:** Implement the profile read and update endpoints.

**Key Implementation Details:**
- `GET /me`: `authenticate` middleware applied per-route; `SELECT * FROM profiles WHERE id = req.user.id`; returns `{ profile }`
- `PUT /me`: `authenticate` + `validate(updateProfileSchema)`; schema: `full_name: z.string().min(1).max(100).optional()`, `avatar_url: z.string().url().optional()`; `UPDATE profiles SET ...req.body, updated_at = now() WHERE id = req.user.id`; returns `{ profile }`
- Both routes handle the edge case where the profile trigger failed on signup (returns 404)

---

### TICKET-1C-12: Projects CRUD Routes (projects.routes.ts)

**Status:** Done

**File:** `apps/api/src/routes/projects.routes.ts`

**Description:** Implement full CRUD for projects with ownership enforcement and run statistics aggregation.

**Key Implementation Details:**
- All routes pre-protected by `authenticate` applied in `app.ts`
- `uuidParamsSchema = z.object({ id: z.string().uuid() })` — validates `:id` params
- `GET /`: `SELECT * FROM projects WHERE user_id = req.user.id ORDER BY created_at DESC`; returns `{ projects, count }`
- `POST /`: validates `name` (required, max 200), `description` (optional, max 1000), `base_url` (optional, URL format); inserts with `user_id = req.user.id`; returns 201 `{ project }`
- `GET /:id`: ownership check via `WHERE id = :id AND user_id = req.user.id`; aggregates run stats from `test_runs` table (`total_runs`, `passed_runs`, `failed_runs`); returns `{ project, stats }`
- `PUT /:id`: validates params + body; `WHERE id = :id AND user_id = req.user.id` — defense-in-depth beyond RLS
- `DELETE /:id`: `WHERE id = :id AND user_id = req.user.id`; returns `{ success: true }`

---

### TICKET-1C-13: API Keys CRUD + Validate Routes (api-keys.routes.ts)

**Status:** Done

**File:** `apps/api/src/routes/api-keys.routes.ts`

**Description:** Implement full CRUD for API keys with AES-256-GCM encryption and live provider health checks.

**Key Implementation Details:**
- **Hard rule:** `SELECT *` is never used on `api_keys` — `encrypted_key` is explicitly excluded from all queries except `/validate`
- `GET /`: `SELECT id, user_id, provider, key_hint, is_valid, created_at, updated_at FROM api_keys WHERE user_id = req.user.id`
- `POST /`: checks for existing key with same `(user_id, provider)` — returns 409 CONFLICT if found; encrypts raw key; stores `key_hint = rawKey.slice(-4)`; `is_valid: false` on insert
- `PUT /:id`: verifies ownership; re-encrypts new key; sets `is_valid: true` (optimistic — confirmed on next `/validate`)
- `DELETE /:id`: ownership check; returns `{ success: true }`
- `POST /:id/validate`: fetches `encrypted_key` (only time it's selected); decrypts; calls `callProviderHealthCheck(provider, rawKey)`; persists `is_valid` result; returns `{ is_valid, error? }`
- Provider health checks: OpenAI (`GET /v1/models` → 200), Anthropic (`POST /v1/messages` → 200 or 400), Gemini (`GET /v1beta/models?key=` → 200)

---

### TICKET-1C-14: Socket.io Scaffold with JWT Auth (socket-server.ts)

**Status:** Done

**File:** `apps/api/src/websocket/socket-server.ts`

**Description:** Create the Socket.io server scaffold with JWT authentication middleware and stub event handlers for future phases.

**Key Implementation Details:**
- `new Server(httpServer, { cors: { origin: env.CORS_ORIGINS, credentials: true }, transports: ['websocket', 'polling'] })`
- Auth middleware: `io.use(async (socket, next) => ...)` — extracts token from `socket.handshake.auth.token` or `Authorization` header; calls `supabase.auth.getUser(token)`; attaches `socket.data.userId` and `socket.data.email`
- `test:start` event stub — logs payload; TODO: MVP-2 dispatch to test execution job queue
- `recording:start` event stub — logs payload; TODO: MVP-3 dispatch to recording session handler
- `disconnect` event — logs `socketId` and `reason`

---

### TICKET-1C-15: Redis No-Op Stub (redis.ts)

**Status:** Done

**File:** `apps/api/src/config/redis.ts`

**Description:** Create a no-op Redis stub so the codebase compiles and runs without a Redis connection. BullMQ job queues are a post-MVP feature.

**Key Implementation Details:**
- `export const redisClient = null as unknown as never` — typed as `never` so any accidental usage causes a TypeScript error
- `export async function connectRedis(): Promise<void>` — logs a skip message; no actual connection attempt
- No `ioredis` or `@upstash/redis` dependency added to `package.json`

---

### TICKET-1C-16: Express Type Augmentation (express.d.ts)

**Status:** Done

**File:** `apps/api/src/types/express.d.ts`

**Description:** Augment the global Express `Request` interface to add `req.user` to all route handlers without requiring explicit type casting.

**Key Implementation Details:**
- `declare global { namespace Express { interface Request { user: { id: string; email: string; role: string } } } }`
- `export {}` — required to make this a module (not a script) so the `declare global` augmentation is applied correctly
- Placed in `src/types/` — TypeScript picks it up automatically via `tsconfig.json` `include` paths
- `auth.middleware.ts` sets `req.user` after successful authentication; all downstream route handlers access it without type assertions
