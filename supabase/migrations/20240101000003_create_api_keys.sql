-- Migration: Create api_keys table
-- Description: Stores encrypted AI provider API keys per user.
--              Enforces one key per provider per user via a unique constraint.

CREATE TABLE IF NOT EXISTS public.api_keys (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider      TEXT        NOT NULL CHECK (provider IN ('openai', 'anthropic', 'gemini')),
    encrypted_key TEXT        NOT NULL,
    key_hint      TEXT,
    is_valid      BOOLEAN     DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT api_keys_user_provider_unique UNIQUE (user_id, provider)
);

-- ─── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can only read their own API keys
CREATE POLICY "api_keys_select_policy"
    ON public.api_keys
    FOR SELECT
    USING (user_id = auth.uid());

-- INSERT: Users can only insert keys for themselves
CREATE POLICY "api_keys_insert_policy"
    ON public.api_keys
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- UPDATE: Users can only update their own keys
CREATE POLICY "api_keys_update_policy"
    ON public.api_keys
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- DELETE: Users can only delete their own keys
CREATE POLICY "api_keys_delete_policy"
    ON public.api_keys
    FOR DELETE
    USING (user_id = auth.uid());
