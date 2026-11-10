import { describe, expect, it, vi } from 'vitest';

const createSignedUrls = vi.fn();
vi.mock('../../config/supabase.js', () => ({
  supabase: { storage: { from: () => ({ createSignedUrls }) } },
}));

const { signArtifacts, signBugScreenshots } = await import('../artifacts.js');

describe('signArtifacts', () => {
  it('signs bucket paths and passes other values through', async () => {
    createSignedUrls.mockResolvedValueOnce({ data: [{ path: 'screenshots/r/step_1.png', signedUrl: 'https://s/1' }], error: null });
    expect(await signArtifacts(['screenshots/r/step_1.png', '/demo/a.png', null])).toEqual(['https://s/1', '/demo/a.png', null]);
  });

  it('drops only the screenshots when storage fails, so the run or bug list still loads', async () => {
    createSignedUrls.mockResolvedValue({ data: null, error: { message: 'storage down' } });
    expect(await signArtifacts(['screenshots/r/step_1.png', '/demo/a.png'])).toEqual([null, '/demo/a.png']);
    expect(await signBugScreenshots([{ id: 'b', screenshot_urls: ['screenshots/r/step_1.png'] }])).toEqual([
      { id: 'b', screenshot_urls: [] },
    ]);
  });
});
