import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

// Service-role client — bypasses RLS. Never expose to untrusted callers.
// autoRefreshToken and persistSession must be false for server-side (non-browser) use.
export const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

export type { SupabaseClient } from '@supabase/supabase-js';
