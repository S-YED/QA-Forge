import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['400', '500', '600', '700', '800'],
});
// Code / terminal / data font. The live test-execution terminal is the hero
// surface, so its monospace is brand — pin it instead of falling back to
// whatever system mono the visitor happens to have.
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'QA Forge — AI-Powered Test Automation',
  description:
    'Describe your tests in plain English. Let AI generate them. Watch Playwright execute them live. The AI-powered QA platform that thinks like a QA engineer.',
  keywords: ['QA automation', 'AI testing', 'Playwright', 'test generation', 'end-to-end testing'],
  authors: [{ name: 'SYED', url: 'https://github.com/S-YED' }],
  openGraph: {
    title: 'QA Forge — AI-Powered Test Automation',
    description:
      'Describe your tests in plain English. Let AI generate them. Watch Playwright execute them live.',
    type: 'website',
    siteName: 'QA Forge',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'QA Forge — AI-Powered Test Automation',
    description: 'The AI-powered QA platform that thinks like a QA engineer.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`scroll-smooth ${inter.variable} ${jakarta.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-sans antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
