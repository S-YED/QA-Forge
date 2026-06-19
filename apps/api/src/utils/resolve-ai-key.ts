import { supabase } from '../config/supabase.js';
import { decrypt } from './encryption.js';
import { AppError } from '../middleware/error-handler.js';
import type { ApiKeyProvider } from '@qaforge/shared-types';

/**
 * Result of resolving an AI provider key for a given user.
 */
export interface ResolvedAIKey {
  provider: ApiKeyProvider;
  apiKey: string;
}

/**
 * Preferred provider order when auto-selecting.
 */
const PREFERRED_ORDER: ApiKeyProvider[] = [
  'anthropic' as ApiKeyProvider,
  'openai' as ApiKeyProvider,
  'gemini' as ApiKeyProvider,
  'openrouter' as ApiKeyProvider,
];

/**
 * Resolves an AI API key for the given user.
 *
 * - If `preferredProvider` is specified, fetches the user's key for that provider.
 * - If omitted, auto-selects from the user's valid keys in preferred order
 *   (Anthropic > OpenAI > Gemini).
 *
 * @throws AppError if no valid key is found.
 */
export async function resolveAIKey(
  userId: string,
  preferredProvider?: string,
): Promise<ResolvedAIKey> {
  if (preferredProvider) {
    // User specified a provider — find their key for it
    const { data: keyRow } = await supabase
      .from('api_keys')
      .select('id, provider, encrypted_key, is_valid')
      .eq('user_id', userId)
      .eq('provider', preferredProvider)
      .eq('is_valid', true)
      .single();

    if (!keyRow) {
      throw new AppError(
        'VALIDATION_ERROR',
        400,
        `No valid ${preferredProvider} API key found. Add and validate one in Settings → API Keys.`,
      );
    }

    return {
      provider: keyRow.provider as ApiKeyProvider,
      apiKey: decrypt(keyRow.encrypted_key as string),
    };
  }

  // Auto-select: pick the first valid key from preferred order
  const { data: validKeys } = await supabase
    .from('api_keys')
    .select('id, provider, encrypted_key')
    .eq('user_id', userId)
    .eq('is_valid', true);

  if (!validKeys || validKeys.length === 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      400,
      'No valid AI provider keys found. Add and validate at least one API key in Settings → API Keys.',
    );
  }

  const sorted = validKeys.sort((a, b) => {
    return (
      PREFERRED_ORDER.indexOf(a.provider as ApiKeyProvider) -
      PREFERRED_ORDER.indexOf(b.provider as ApiKeyProvider)
    );
  });

  return {
    provider: sorted[0].provider as ApiKeyProvider,
    apiKey: decrypt(sorted[0].encrypted_key as string),
  };
}
