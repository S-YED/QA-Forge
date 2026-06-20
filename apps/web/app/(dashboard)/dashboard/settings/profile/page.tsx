import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ProfileForm } from '@/components/settings/profile-form';
import { PageHeader } from '@/components/shared/page-header';
import { Card } from '@/components/ui/card';
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
  const supabase = await createServerSupabaseClient();

  // getUser() makes a live network call to validate the token (safe on server).
  // getSession() only reads the cookie - do NOT use it alone for auth decisions.
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
      <PageHeader title="Profile" description="Manage your account settings." />
      {profile ? (
        <ProfileForm profile={profile} />
      ) : (
        <Card className="max-w-lg p-6 text-center text-sm text-muted-foreground">
          Unable to load profile. Please try again later.
        </Card>
      )}
    </div>
  );
}
