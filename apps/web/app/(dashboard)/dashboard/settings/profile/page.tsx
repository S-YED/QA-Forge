import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ProfileForm } from '@/components/settings/profile-form';
import type { Profile } from '@qaforge/shared-types';

/** Matches GET /api/auth/me response shape from the backend */
interface ProfileResponse {
  profile: Profile;
}

async function getProfile(accessToken: string): Promise<Profile | null> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  const res = await fetch(`${baseUrl}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    return null;
  }

  const data: ProfileResponse = await res.json();
  return data.profile ?? null;
}

export default async function ProfilePage() {
  const supabase = createServerSupabaseClient();

  // getUser() makes a live network call to validate the token (safe on server).
  // getSession() only reads the cookie — do NOT use it alone for auth decisions.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const profile = user && session?.access_token
    ? await getProfile(session.access_token)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account settings
        </p>
      </div>
      {profile ? (
        <ProfileForm profile={profile} />
      ) : (
        <div className="rounded-lg border bg-card p-6 text-center text-muted-foreground">
          Unable to load profile. Please try again later.
        </div>
      )}
    </div>
  );
}
