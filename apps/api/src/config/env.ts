import 'dotenv/config';
import { z } from 'zod';

// ── Schema ─────────────────────────────────────────────────────────────────────

const schema = z.object({
  PORT: z.string().default('4000'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  /** 32 random bytes as 64 hex characters; encrypts users' stored AI keys. Non-hex input would
   *  silently decode to a shorter key, so it is rejected here. */
  ENCRYPTION_KEY: z
    .string()
    .regex(
      /^[0-9a-fA-F]{64}$/,
      `must be 64 hex characters. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    ),
  /** Optional in MVP — BullMQ is post-MVP. */
  REDIS_URL: z.string().optional(),
  /** Comma-separated hostnames test runs may reach even though they resolve to private
   *  addresses (SSRF guard). `*` allows all: local development only. Empty in production. */
  ALLOW_PRIVATE_HOSTS: z.string().default(''),
  /** `true`: users with no AI key get the fixed local demo test cases (not AI) for apps/demo-app. */
  AI_LOCAL_DEMO: z.enum(['true', 'false']).default('false'),
  /** Reverse proxies in front of the API (Railway: 1), so rate limits count the real client address and not
   *  the proxy's. Defaults to 1 in production, 0 elsewhere. Never set it higher than the real number: each
   *  extra hop trusted lets a client forge its address. */
  TRUST_PROXY_HOPS: z.string().regex(/^\d+$/, 'must be a whole number').optional(),
});

export type Env = z.infer<typeof schema>;

// ── Parse ──────────────────────────────────────────────────────────────────────

const result = schema.safeParse(process.env);

if (!result.success) {
  // One line per variable, so a stranger can fix apps/api/.env without reading Zod output.
  const lines = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
  console.error(`[env] Invalid environment variables (see apps/api/.env.example):\n${lines.join('\n')}`);
  process.exit(1);
}

const data = result.data;

// ── Export ─────────────────────────────────────────────────────────────────────

export const env = {
  PORT: Number(data.PORT),
  NODE_ENV: data.NODE_ENV,
  CORS_ORIGINS: data.CORS_ORIGIN.split(',').map((s) => s.trim()),
  SUPABASE_URL: data.SUPABASE_URL,
  SUPABASE_ANON_KEY: data.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: data.SUPABASE_SERVICE_ROLE_KEY,
  ENCRYPTION_KEY: data.ENCRYPTION_KEY,
  REDIS_URL: data.REDIS_URL,
  ALLOWED_PRIVATE_HOSTS: data.ALLOW_PRIVATE_HOSTS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  AI_LOCAL_DEMO: data.AI_LOCAL_DEMO === 'true',
  TRUST_PROXY_HOPS: Number(data.TRUST_PROXY_HOPS ?? (data.NODE_ENV === 'production' ? 1 : 0)),
} as const;
