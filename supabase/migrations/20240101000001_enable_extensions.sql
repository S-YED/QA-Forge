-- Migration: Enable PostgreSQL Extensions
-- Description: Enables uuid-ossp, pgvector, and moddatetime extensions
--              required by the QAForge schema.

-- Enable uuid-ossp for UUID generation functions (e.g. uuid_generate_v4())
-- Note: gen_random_uuid() is available natively in PG 13+ without this extension,
-- but the schema references uuid-ossp explicitly.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Enable pgvector for vector similarity search
-- Used by app_contexts table for AI embedding storage (vector(1536))
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA extensions;

-- Enable moddatetime for automatic updated_at timestamp management
CREATE EXTENSION IF NOT EXISTS "moddatetime" WITH SCHEMA extensions;
