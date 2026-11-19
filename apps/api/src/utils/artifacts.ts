// Test artifacts (screenshots) live in a private bucket. Rows store the object path; readers get
// a short-lived signed URL. Values that are not bucket paths (seeded demo images such as
// `/demo/x.png`, external URLs) pass through unchanged.
import { supabase } from '../config/supabase.js';
import logger from './logger.js';

export const ARTIFACT_BUCKET = 'test-artifacts';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export const screenshotPath = (testRunId: string, stepNumber: number) => `screenshots/${testRunId}/step_${stepNumber}.png`;
const isArtifactPath = (value: string) => value.startsWith('screenshots/');

/** Replace bucket paths with signed URLs, keeping order; other values pass through. */
export async function signArtifacts(values: (string | null | undefined)[]): Promise<(string | null)[]> {
  const paths = [...new Set(values.filter((v): v is string => !!v && isArtifactPath(v)))];
  if (paths.length === 0) return values.map((v) => v ?? null);
  const { data, error } = await supabase.storage.from(ARTIFACT_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  // A storage hiccup costs the screenshots, never the run or bug list they belong to.
  if (error) logger.warn(`Could not sign screenshot URLs: ${error.message}`);
  const signed = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return values.map((v) => (!v ? null : isArtifactPath(v) ? (signed.get(v) ?? null) : v));
}

/** Every screenshot path stored by the runs of a user, a project or a suite run (G2, G10, DEMO-1: read before the rows go). */
export async function screenshotsOfRuns(column: 'user_id' | 'project_id' | 'batch_id', id: string): Promise<string[]> {
  const paths: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('test_steps')
      .select(`id, screenshot_url, test_runs!inner(${column})`)
      .eq(`test_runs.${column}`, id)
      .not('screenshot_url', 'is', null)
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(`Could not list the screenshots: ${error.message}`);
    paths.push(...data.map((s) => s.screenshot_url as string).filter(isArtifactPath));
    if (data.length < 1000) return paths;
  }
}

/** Remove screenshots whose rows are gone. A storage hiccup only leaves files no one can reach, so it is logged. */
export async function removeScreenshots(paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 1000) {
    const { error } = await supabase.storage.from(ARTIFACT_BUCKET).remove(paths.slice(i, i + 1000));
    if (error) logger.warn({ event: 'screenshots:left_behind', count: paths.slice(i, i + 1000).length, error: error.message });
  }
}

/** Sign the screenshot_urls of each bug (rows from `bugs`). */
export async function signBugScreenshots<T extends { screenshot_urls?: string[] | null }>(bugs: T[]): Promise<T[]> {
  const flat = bugs.flatMap((b) => b.screenshot_urls ?? []);
  const signed = await signArtifacts(flat);
  let i = 0;
  return bugs.map((b) => ({
    ...b,
    screenshot_urls: (b.screenshot_urls ?? []).map(() => signed[i++]).filter((u): u is string => !!u),
  }));
}
