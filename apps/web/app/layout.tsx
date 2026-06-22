import type { Metadata, Viewport } from 'next';
import { Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';

// UI + display. One well-tuned grotesk carries headings, labels, body and data -
// weight/size contrast does the work a display/body pair would.
const sans = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

// Code / console / step timings / selectors. The live execution console is the
// hero surface, so its monospace is pinned, never a system fallback.
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'QA Forge - AI test automation you can watch run',
  description:
    'Describe a test in plain English. AI writes the Playwright script. Watch it execute live, step by step, with screenshots and auto-filed bugs.',
  keywords: ['QA automation', 'AI testing', 'Playwright', 'test generation', 'end-to-end testing'],
  authors: [{ name: 'SYED', url: 'https://github.com/S-YED' }],
  openGraph: {
    title: 'QA Forge - AI test automation you can watch run',
    description:
      'Describe a test in plain English. AI writes the Playwright script. Watch it execute live.',
    type: 'website',
    siteName: 'QA Forge',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'QA Forge - AI test automation you can watch run',
    description: 'The QA platform that thinks like an engineer.',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f9fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0e12' },
  ],
};

// Apply the saved (or system) theme before first paint - no flash, no hidden body.
const themeScript = `(function(){try{var t=localStorage.getItem('qaforge-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.classList.toggle('dark',t==='dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
