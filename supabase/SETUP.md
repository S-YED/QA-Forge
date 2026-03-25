# QAForge — Supabase Database Setup Guide

This guide covers local development with Docker and cloud deployment to Supabase.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Docker Desktop** | Latest | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| **Supabase CLI** | ≥ 1.150.0 | `npm install -g supabase` |
| **Node.js** | ≥ 18 | [nodejs.org](https://nodejs.org/) |
| **pnpm** | ≥ 8 | `npm install -g pnpm` |

Verify your installs:

```bash
docker --version
supabase --version
node --version
```

---

## Local Development (Docker)

### 1. Start Supabase

The `config.toml` is already configured. From the project root:

```bash
supabase start
```

Docker will pull the required images and start all local containers (PostgreSQL, Studio, Auth, Storage, etc.). This may take a few minutes on first run.

> [!NOTE]
> Make sure Docker Desktop is **running** before executing `supabase start`.

### 2. Apply Migrations & Seed Data

```bash
supabase db reset
```

This command:
- Drops the local database and re-creates it
- Applies all 17 migration files in order from `supabase/migrations/`
- Runs `supabase/seed.sql` to populate demo data

### 3. Retrieve Local Credentials

After `supabase start`, the CLI prints your local credentials. You can also retrieve them anytime:

```bash
supabase status
```

Copy the values into your `.env` files:

```ini
# apps/web/.env.local
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase status>

# apps/api/.env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase status>
```

### 4. Access Local Studio

Open [http://localhost:54323](http://localhost:54323) to explore the database, run queries, and inspect tables visually.

---

## Cloud Deployment (Supabase Free Tier)

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New Project** and fill in the details
3. Wait for the project to be provisioned (~2 minutes)

### 2. Enable pgvector Extension

1. In the Supabase Dashboard, open your project
2. Navigate to **Database → Extensions**
3. Search for **vector** and toggle it **on**
4. Set the schema to `extensions` when prompted

> [!IMPORTANT]
> pgvector must be enabled **before** running migrations, as migration 14 (`create_app_contexts`) uses the `extensions.vector(1536)` type and the HNSW index.

### 3. Link Your Local CLI to the Cloud Project

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

Find `<your-project-ref>` in your Supabase Dashboard URL:
`https://app.supabase.com/project/<your-project-ref>`

### 4. Push Migrations to Cloud

```bash
supabase db push
```

This applies all migrations in `supabase/migrations/` to your cloud database in order.

> [!WARNING]
> `supabase db push` does **not** run `seed.sql` on the cloud. The seed file is for local development only.

### 5. Copy Cloud Credentials to `.env`

From the Supabase Dashboard → **Project Settings → API**:

```ini
# apps/web/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>

# apps/api/.env
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role secret key>
```

---

## Schema Verification

### Verify All 15 Tables Exist

Run in **SQL Editor** (Studio → SQL Editor → New Query):

```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

Expected tables:
`api_keys`, `app_contexts`, `bugs`, `export_schemas`, `integrations`, `media_attachments`, `profiles`, `projects`, `recorded_sessions`, `session_actions`, `sprint_changes`, `test_cases`, `test_runs`, `test_steps`, `test_suites`

### Verify RLS is Enabled on All Tables

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

All rows should show `rowsecurity = true`.

### Verify updated_at Triggers

```sql
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name = 'set_updated_at'
ORDER BY event_object_table;
```

Should return 9 rows (one per table with `updated_at`).

### Test the Auth Trigger

1. In Studio → **Authentication → Users**, click **Add user**
2. Fill in an email and password
3. Navigate to **Table Editor → profiles**
4. Confirm a new row was automatically created for that user

---

## Troubleshooting

### Docker Not Running

**Error**: `Cannot connect to the Docker daemon`

**Fix**: Start Docker Desktop and wait for it to be fully running before retrying `supabase start`.

### Port Conflicts

**Error**: `bind: address already in use` for port 54321/54322/54323

**Fix**: Edit `supabase/config.toml` to change the conflicting port numbers. Alternatively, stop any conflicting services:

```bash
# Find what's using port 54321
netstat -ano | findstr :54321   # Windows
lsof -i :54321                  # macOS / Linux
```

### pgvector Not Available

**Error**: `type "extensions.vector" does not exist` or `function "vector_cosine_ops" does not exist`

**Fix (local)**: The `config.toml` sets up pgvector automatically. If issues persist:
```bash
supabase stop
supabase start
supabase db reset
```

**Fix (cloud)**: Manually enable the `vector` extension from Dashboard → Database → Extensions before pushing migrations.

### `supabase db push` Fails on First Run

If migration 2 fails because `auth.users` doesn't exist, ensure you are linking to a valid Supabase project (not a blank PostgreSQL instance). Supabase provides the `auth` schema automatically.

### Seed Fails with `crypt() does not exist`

Ensure the `pgcrypto` extension is enabled. Run:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

Then re-run `supabase db reset`.

### Migrations Applied Out of Order

Migration files must be applied in filename order (the 17-digit timestamp prefix ensures this). Never rename migration files after they have been applied; create new migrations to make changes instead.

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `supabase start` | Start local Supabase (Docker) |
| `supabase stop` | Stop local containers |
| `supabase db reset` | Re-apply all migrations + seed |
| `supabase db push` | Push migrations to linked cloud project |
| `supabase status` | Show local API URL and keys |
| `supabase migration new <name>` | Create a new timestamped migration file |
| `supabase db diff` | Diff local schema vs remote |
| `supabase logs db` | View PostgreSQL logs |
