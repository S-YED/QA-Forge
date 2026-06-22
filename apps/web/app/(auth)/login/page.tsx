'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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
    <Card className="w-full shadow-sm">
      <CardHeader className="items-center gap-2 pb-2 text-center">
        <CardTitle className="text-xl">Sign in to QA Forge</CardTitle>
        <CardDescription>AI-powered end-to-end testing platform</CardDescription>
      </CardHeader>
      <CardContent>
        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: 'oklch(var(--primary))',
                  brandAccent: 'oklch(var(--primary) / 0.9)',
                  brandButtonText: 'oklch(var(--primary-foreground))',
                  inputBackground: 'oklch(var(--background))',
                  inputBorder: 'oklch(var(--input))',
                  inputBorderFocus: 'oklch(var(--ring))',
                  inputBorderHover: 'oklch(var(--border))',
                  inputText: 'oklch(var(--foreground))',
                  inputPlaceholder: 'oklch(var(--muted-foreground))',
                  dividerBackground: 'oklch(var(--border))',
                  defaultButtonBackground: 'oklch(var(--secondary))',
                  defaultButtonBackgroundHover: 'oklch(var(--secondary) / 0.8)',
                  defaultButtonBorder: 'oklch(var(--border))',
                  defaultButtonText: 'oklch(var(--secondary-foreground))',
                  messageText: 'oklch(var(--muted-foreground))',
                  messageTextDanger: 'oklch(var(--destructive))',
                  anchorTextColor: 'oklch(var(--primary))',
                  anchorTextHoverColor: 'oklch(var(--primary) / 0.8)',
                },
                radii: {
                  borderRadiusButton: 'var(--radius)',
                  buttonBorderRadius: 'var(--radius)',
                  inputBorderRadius: 'var(--radius)',
                },
              },
            },
          }}
          providers={[]}
          view="sign_in"
          showLinks={true}
          redirectTo={`${typeof window !== 'undefined' ? window.location.origin : ''}/dashboard/projects`}
        />
      </CardContent>
    </Card>
  );
}
