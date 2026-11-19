// DEMO-1: the hosted demo shop is a static copy of apps/demo-app/public (vercel.json). Every page a demo case
// opens must exist there under its clean address (/login -> login.html), and other addresses get the 404 page.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { localDemoTestCases } from '@qaforge/ai-engine';

const shop = (p: string) => fileURLToPath(new URL(`../../../demo-app/${p}`, import.meta.url));

describe('hosted demo shop', () => {
  it('serves every page the demo cases open, and a 404 page for an unknown one', () => {
    const config = JSON.parse(readFileSync(shop('vercel.json'), 'utf8')) as Record<string, unknown>;
    expect(config).toMatchObject({ cleanUrls: true, outputDirectory: 'public' });
    expect(existsSync(shop('public/404.html'))).toBe(true);

    const opened = new Set(localDemoTestCases('').flatMap((c) => c.steps.filter((s) => s.action === 'navigate').map((s) => s.value ?? '')));
    const missing = [...opened].filter((p) => !existsSync(shop(`public/${p === '/' ? 'index' : p.slice(1)}.html`)));
    expect(missing).toEqual(['/no-such-page']); // the one case that checks the not-found page
  });
});
