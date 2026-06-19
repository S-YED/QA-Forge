-- Migration 21: add 'openrouter' to the api_keys.provider CHECK constraint.
-- Description: QA Forge now supports OpenRouter (OpenAI-wire-compatible gateway)
--              as a first-class AI provider alongside OpenAI, Anthropic, and Gemini.
--              The original inline column CHECK was created in migration 3 and only
--              permitted ('openai','anthropic','gemini'). This migration replaces it
--              idempotently with one that also allows 'openrouter'.

DO $$
DECLARE
  c text;
BEGIN
  -- Find whatever the provider CHECK constraint is currently named
  -- (inline column checks get an auto-generated name).
  SELECT conname INTO c
    FROM pg_constraint
   WHERE conrelid = 'public.api_keys'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%provider%';

  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.api_keys DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE public.api_keys
  ADD CONSTRAINT api_keys_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'gemini', 'openrouter'));
