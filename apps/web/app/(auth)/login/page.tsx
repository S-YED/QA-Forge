'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        router.push('/dashboard/projects');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, supabase.auth]);

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">QAForge</h1>
        <p className="text-muted-foreground">
          Sign in to your account to continue
        </p>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: 'hsl(222.2 47.4% 11.2%)',
                  brandAccent: 'hsl(210 40% 96.1%)',
                  brandButtonText: 'hsl(210 40% 98%)',
                },
              },
            },
          }}
          providers={[]}
          view="sign_in"
          showLinks={true}
          redirectTo={`${typeof window !== 'undefined' ? window.location.origin : ''}/dashboard/projects`}
        />
      </div>
    </div>
  );
}
