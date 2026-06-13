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
    <div className="space-y-8">
      {/* Brand Header */}
      <div className="flex flex-col items-center space-y-3 text-center">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/30">
          <div className="absolute inset-0.5 rounded-[14px] bg-[#07070d] flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="url(#brand-grad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-pulse"
            >
              <defs>
                <linearGradient id="brand-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="hsl(262.1 83.3% 67.8%)" />
                  <stop offset="100%" stopColor="hsl(222.2 83.3% 67.8%)" />
                </linearGradient>
              </defs>
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
        </div>
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-50 via-slate-200 to-slate-400 bg-clip-text text-transparent">
            QAForge
          </h1>
          <p className="text-sm text-slate-400">
            AI-powered end-to-end testing platform
          </p>
        </div>
      </div>

      {/* Glassmorphic Auth Card */}
      <div className="relative rounded-2xl border border-white/[0.08] bg-slate-900/40 p-8 backdrop-blur-xl shadow-2xl shadow-violet-500/5 overflow-hidden">
        {/* Animated Gradient Edge */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-violet-500 to-transparent opacity-80" />
        
        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: 'hsl(262.1 83.3% 57.8%)',
                  brandAccent: 'hsl(262.1 83.3% 47.8%)',
                  brandButtonText: '#ffffff',
                  inputBackground: 'rgba(255, 255, 255, 0.03)',
                  inputBorder: 'rgba(255, 255, 255, 0.08)',
                  inputBorderFocus: 'hsl(262.1 83.3% 57.8%)',
                  inputBorderHover: 'rgba(255, 255, 255, 0.15)',
                  inputText: '#f8fafc',
                  inputPlaceholder: '#64748b',
                  dividerBackground: 'rgba(255, 255, 255, 0.08)',
                  messageText: 'hsl(262.1 83.3% 80%)',
                  messageTextDanger: 'hsl(0 84.2% 60.2%)',
                  anchorTextColor: 'hsl(262.1 83.3% 70%)',
                  anchorTextHoverColor: 'hsl(262.1 83.3% 80%)',
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
