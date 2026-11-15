import { supabase } from '../config/supabase.js';
import { decrypt } from '../utils/encryption.js';

// F4: project variables. A step refers to one as {{NAME}} in its value or element; the executor
// resolves it just before the run and masks every secret value in anything it stores, sends or logs.

export const VARIABLE_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
/** What a masked secret looks like in errors, bug reports and logs. */
export const MASK = '••••';

const template = () => /\{\{\s*([A-Z][A-Z0-9_]{0,63})\s*\}\}/g;

export interface RunVariable {
  name: string;
  value: string;
  is_secret: boolean;
}

interface StepFields {
  selector?: string | null;
  value?: string | null;
}

/** True when any step refers to a variable, so runs without them never touch the variables table. */
export function usesVariables(steps: unknown[]): boolean {
  return steps.some((s) => {
    const { selector, value } = (s ?? {}) as StepFields;
    return [selector, value].some((f) => typeof f === 'string' && template().test(f));
  });
}

/**
 * Replace {{NAME}} in each step's value and element. `missing` lists names with no variable (the run
 * must not start); `secrets` are the secret values to mask afterwards, longest first so a secret that
 * contains another is masked whole.
 */
export function resolveSteps<T>(steps: T[], variables: RunVariable[]): { steps: T[]; missing: string[]; secrets: string[] } {
  const byName = new Map(variables.map((v) => [v.name, v.value]));
  const missing = new Set<string>();
  const fill = (text: unknown) =>
    typeof text !== 'string'
      ? text
      : text.replace(template(), (whole, name: string) => {
          if (byName.has(name)) return byName.get(name)!;
          missing.add(name);
          return whole;
        });
  const resolved = steps.map((step) => {
    if (!step || typeof step !== 'object') return step;
    const { selector, value } = step as StepFields;
    return { ...step, ...(selector != null && { selector: fill(selector) }), ...(value != null && { value: fill(value) }) } as T;
  });
  const secrets = [...new Set(variables.filter((v) => v.is_secret && v.value).map((v) => v.value))].sort((a, b) => b.length - a.length);
  return { steps: resolved, missing: [...missing], secrets };
}

/** Hide every secret value in a piece of text (an error message, a bug description, a log line). */
export function maskSecrets<T extends string | null | undefined>(text: T, secrets: string[]): T {
  if (!text || !secrets.length) return text;
  let out: string = text;
  for (const secret of secrets) out = out.split(secret).join(MASK);
  return out as T;
}

/** Postgres/PostgREST codes for a missing table: migration 27 has not been applied, so there are no variables yet. */
const NOT_MIGRATED = ['42P01', 'PGRST205'];

/** The project's variables, decrypted. Only the executor calls this; values never go to a client from here. */
export async function loadVariables(projectId: string): Promise<RunVariable[]> {
  const { data, error } = await supabase
    .from('project_variables')
    .select('name, value_encrypted, is_secret')
    .eq('project_id', projectId);
  if (error) {
    if (NOT_MIGRATED.includes(error.code)) return [];
    throw new Error(`Could not load project variables: ${error.message}`);
  }
  return (data ?? []).map((v) => ({ name: v.name, value: decrypt(v.value_encrypted), is_secret: v.is_secret }));
}
