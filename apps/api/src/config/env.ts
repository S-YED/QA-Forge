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
  DATABASE_URL: z.string().min(1),
  /** 32 bytes represented as a 64-character lowercase hex string.
   *  Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" */
  ENCRYPTION_KEY: z.string().length(64),
  JWT_SECRET: z.string().min(32),
  /** Optional in MVP — BullMQ is post-MVP. */
  REDIS_URL: z.string().optional(),
  /** Comma-separated hostnames test runs may reach even though they resolve to private
   *  addresses (SSRF guard). `*` allows all: local development only. Empty in production. */
  ALLOW_PRIVATE_HOSTS: z.string().default(''),
  /** `true`: users with no AI key get the fixed local demo test cases (not AI) for apps/demo-app. */
  AI_LOCAL_DEMO: z.enum(['true', 'false']).default('false'),
});

export type Env = z.infer<typeof schema>;

// ── Parse ──────────────────────────────────────────────────────────────────────

const result = schema.safeParse(process.env);

if (!result.success) {
  console.error('[env] ❌ Invalid environment variables:');
  console.error(JSON.stringify(result.error.format(), null, 2));
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
  DATABASE_URL: data.DATABASE_URL,
  ENCRYPTION_KEY: data.ENCRYPTION_KEY,
  JWT_SECRET: data.JWT_SECRET,
  REDIS_URL: data.REDIS_URL,
  ALLOWED_PRIVATE_HOSTS: data.ALLOW_PRIVATE_HOSTS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  AI_LOCAL_DEMO: data.AI_LOCAL_DEMO === 'true',
} as const;
