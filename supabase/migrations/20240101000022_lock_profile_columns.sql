-- Migration: Lock down client-writable columns on public.profiles
-- Description: SECURITY FIX (privilege escalation).
--   profiles_update_policy lets a user UPDATE their own row, and Supabase grants
--   anon/authenticated full table privileges by default, so any signed-in user
--   could PATCH /rest/v1/profiles {"role":"admin"} with the public key and
--   public.is_admin() would then open every table to them. It also let the
--   read-only demo user DELETE their own profile, cascading away all demo data.
--
--   RLS decides WHICH ROWS; column privileges decide WHICH COLUMNS. Clients may
--   only edit their display fields. role / is_demo / email are server-managed
--   (service_role and SECURITY DEFINER functions are unaffected by these grants).
--   Profile rows are created by the handle_new_user() trigger (SECURITY DEFINER)
--   and removed only via the auth.users ON DELETE CASCADE.

REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (full_name, avatar_url) ON public.profiles TO authenticated;

-- Post-deploy audit (run manually, read-only) to find accounts that may have
-- self-escalated before this fix:
--   SELECT id, email, role, updated_at FROM public.profiles WHERE role = 'admin';
