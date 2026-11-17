'use client';

import { use, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type View = 'sign_in' | 'sign_up' | 'forgotten_password';

const TITLES: Record<View, string> = {
  sign_in: 'Sign in to QA Forge',
  sign_up: 'Create your QA Forge account',
  forgotten_password: 'Reset your password',
};

const LINK = 'text-primary underline-offset-4 hover:underline';

export default function LoginPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  // /login?view=sign_up opens the sign-up form directly ("Create free account", demo banner).
  const asked = use(searchParams).view;
  const view: View = asked === 'sign_up' || asked === 'forgotten_password' ? asked : 'sign_in';
  // DD-5: the reset email opens /reset-password, where a new password is chosen. The widget uses one address
  // for every view, so each view is its own page here and the widget's own view links are off.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const redirectTo = `${origin}${view === 'forgotten_password' ? '/reset-password' : '/dashboard/projects'}`;
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
        <CardTitle className="text-xl">{TITLES[view]}</CardTitle>
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
                  inputLabelText: 'oklch(var(--muted-foreground))',
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
          key={view}
          view={view}
          showLinks={false}
          redirectTo={redirectTo}
        />
        <nav className="mt-4 flex flex-col items-center gap-2 text-sm" aria-label="Other ways in">
          {view === 'sign_in' ? (
            <>
              <Link href="/login?view=forgotten_password" className={LINK}>Forgot your password?</Link>
              <Link href="/login?view=sign_up" className={LINK}>Don&apos;t have an account? Sign up</Link>
            </>
          ) : (
            <Link href="/login" className={LINK}>Already have an account? Sign in</Link>
          )}
        </nav>
      </CardContent>
    </Card>
  );
}
