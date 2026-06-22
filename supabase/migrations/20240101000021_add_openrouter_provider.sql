-- Migration 21: add 'openrouter' to the api_keys.provider CHECK constraint.
-- Description: QA Forge now supports OpenRouter (OpenAI-wire-compatible gateway)
--              as a first-class AI provider alongside OpenAI, Anthropic, and Gemini.
--              The original inline column CHECK was created in migration 3 and only
--              permitted ('openai','anthropic','gemini'). This migration replaces it
--              idempotently with one that also allows 'openrouter'.

DO $$
DECLARE
  c record;
BEGIN
  -- Drop every CHECK constraint on api_keys that references the provider column
  -- (the inline column check from migration 3 gets an auto-generated name).
  -- A loop handles the zero-or-many cases safely and keeps the migration
  -- idempotent across re-runs and `supabase db reset`.
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.api_keys'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%provider%'
  LOOP
    EXECUTE format('ALTER TABLE public.api_keys DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.api_keys
  ADD CONSTRAINT api_keys_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'gemini', 'openrouter'));
