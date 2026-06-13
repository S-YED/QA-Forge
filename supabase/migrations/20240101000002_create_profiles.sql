-- Migration: Create profiles table
-- Description: Creates the profiles table which mirrors auth.users. A trigger
--              automatically populates this table when a new auth user is created.

CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    full_name   TEXT,
    avatar_url  TEXT,
    role        TEXT NOT NULL DEFAULT 'tester'
                    CHECK (role IN ('admin', 'tester', 'viewer')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Admin Helper Function ───────────────────────────────────────────────────

-- Function: is_admin
-- Returns true if the currently authenticated user has the 'admin' role.
-- SECURITY DEFINER is used to bypass RLS and prevent recursive policy loops.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$;

-- ─── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can read their own profile; admins can read all profiles; service_role (backend API) bypasses RLS
CREATE POLICY "profiles_select_policy"
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = id OR public.is_admin());

-- INSERT: Only allow inserting a row for the currently authenticated user
--         (direct inserts are rare; the handle_new_user trigger handles this)
CREATE POLICY "profiles_insert_policy"
    ON public.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- UPDATE: Users can only update their own profile; admins can update any profile
CREATE POLICY "profiles_update_policy"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id OR public.is_admin())
    WITH CHECK (auth.uid() = id OR public.is_admin());

-- DELETE: Users can only delete their own profile; admins can delete any profile
CREATE POLICY "profiles_delete_policy"
    ON public.profiles
    FOR DELETE
    USING (auth.uid() = id OR public.is_admin());

-- ─── Auth Trigger: Auto-create profile on new user signup ─────────────────────

-- Function: handle_new_user
-- Automatically inserts a profile row when a new user registers via Supabase Auth.
-- SECURITY DEFINER is required to write to public.profiles from the auth schema context.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, NEW.raw_user_meta_data->>'email', ''),
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, public.profiles.email),
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
        updated_at = now();
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Ensure trigger never blocks user creation under any circumstances
    RETURN NEW;
END;
$$;

-- Trigger: fires AFTER INSERT on auth.users to call handle_new_user()
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
