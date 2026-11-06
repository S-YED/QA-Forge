import {
  GeneratedTestCaseSchema,
  STEP_ACTIONS,
  STEP_ACTION_FIELDS,
  type ApiKeyProvider,
  type GeneratedTestCase,
  type TestCaseStep,
} from '@qaforge/shared-types';

export type { GeneratedTestCase };

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GenerateTestCasesRequest {
  /** Natural language description of the feature/flow */
  prompt: string;
  /** AI provider to use */
  provider: ApiKeyProvider;
  /** Decrypted API key */
  apiKey: string;
  /** Optional application base URL for context */
  baseUrl?: string;
  /** Optional per-request model override (else env override, else provider default) */
  model?: string;
}

export interface GenerateTestCasesResponse {
  test_cases: GeneratedTestCase[];
  /** Cases the model returned that failed the step contract and were dropped. */
  rejected: { title: string; errors: string[] }[];
  provider_used: ApiKeyProvider;
  model_used: string;
  generation_time_ms: number;
}

// ── Step contract (shared with the API and runner) ───────────────────────────

/** Prompt text describing the step shape, built from the shared contract so they can't drift. */
const STEP_FORMAT = `array of { step_number, action, instruction, selector?, value?, expected? } where
  action is one of: ${STEP_ACTIONS.join(', ')}
  instruction is a short human-readable description of the step
  selector is a Playwright selector (prefer [data-testid="..."], then CSS)
  required fields per action:
${STEP_ACTIONS.map((a) => {
  const f = STEP_ACTION_FIELDS[a];
  const req = [f.selector && 'selector', f.value && `value (${f.valueHint})`].filter(Boolean);
  return `    ${a}: ${req.length ? req.join(', ') : 'nothing else'}`;
}).join('\n')}`;

/**
 * Renumber steps 1..n, then validate against the shared schema. Returns the
 * parsed case or the list of problems; never trusts the model's shape.
 */
export function validateGeneratedCase(
  raw: unknown,
): { ok: true; testCase: GeneratedTestCase } | { ok: false; title: string; errors: string[] } {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const steps = Array.isArray(obj.steps)
    ? obj.steps.map((step, idx) => ({ ...(step as object), step_number: idx + 1 }))
    : obj.steps;
  const result = GeneratedTestCaseSchema.safeParse({ ...obj, steps });
  if (result.success) return { ok: true, testCase: result.data };
  return {
    ok: false,
    title: typeof obj.title === 'string' ? obj.title : '(untitled)',
    errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  };
}

// ── Prompt Template ──────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are an expert QA engineer and test automation specialist. Your job is to generate comprehensive, well-structured test cases from a natural language description of a feature or user flow.

RULES:
1. Generate between 3 and 8 test cases per request — aim for full coverage.
2. Always include a mix of positive (happy path), negative (error handling), and edge case tests.
3. Each test case must have clear, actionable steps written in natural language.
4. Every step must use exactly one action from the allowed list and include that action's required fields.
5. Use CSS selectors where possible in the selector field (e.g., button[type="submit"], #email-input, .login-form).
6. Prioritize critical user-facing flows as "high" or "critical" priority.
7. Include accessibility test cases when relevant.

OUTPUT FORMAT:
Return a JSON array of test case objects. Each object must have:
- title: string — concise test case name
- description: string — what this test validates
- steps: ${STEP_FORMAT}
- expected_result: string — final expected outcome
- priority: "critical" | "high" | "medium" | "low"
- type: "functional" | "regression" | "smoke" | "edge_case" | "accessibility" | "negative"
- tags: string[] — relevant tags

Return ONLY valid JSON. No markdown fences. No explanatory text.`;
}

function buildUserPrompt(prompt: string, baseUrl?: string): string {
  let content = `Generate test cases for the following feature/flow:\n\n${prompt}`;
  if (baseUrl) {
    content += `\n\nApplication URL: ${baseUrl}`;
  }
  return content;
}

// ── Provider registry ──────────────────────────────────────────────────────────
// Single source of truth for provider wiring. Adding a provider is one entry in
// PROVIDERS (plus the shared-types enum and the api_keys CHECK constraint) — no
// per-call switch statements to keep in sync.

/** Read an optional env override without depending on @types/node (this package is environment-agnostic). */
function envValue(key: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];
}

// ── Provider errors ───────────────────────────────────────────────────────────

export type AIErrorCode = 'AI_KEY_INVALID' | 'AI_RATE_LIMITED' | 'AI_TIMEOUT' | 'AI_PROVIDER_ERROR' | 'AI_BAD_OUTPUT';

const AI_ERROR_STATUS: Record<AIErrorCode, number> = {
  AI_KEY_INVALID: 422, // the user's stored key is wrong; not 401, which would mean "your QA Forge session"
  AI_RATE_LIMITED: 429,
  AI_TIMEOUT: 504,
  AI_PROVIDER_ERROR: 502,
  AI_BAD_OUTPUT: 502,
};

/** A provider call that failed in a way the user can act on. `statusCode` is the HTTP status to return. */
export class AIProviderError extends Error {
  readonly statusCode: number;
  constructor(
    readonly code: AIErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AIProviderError';
    this.statusCode = AI_ERROR_STATUS[code];
  }
}

/** POST JSON to a provider with a timeout (AI_TIMEOUT_MS, default 60 s) and classified errors. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- provider payloads are untyped; callers read fields defensively
async function postJson(label: string, url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  const timeoutMs = Number(envValue('AI_TIMEOUT_MS')) || 60_000;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new AIProviderError('AI_TIMEOUT', `${label} did not respond within ${Math.round(timeoutMs / 1000)} s. Try again.`);
    }
    throw new AIProviderError('AI_PROVIDER_ERROR', `${label} could not be reached: ${err instanceof Error ? err.message : err}`);
  }
  if (!response.ok) {
    const text = (await response.text().catch(() => '')).slice(0, 300);
    // Gemini reports a bad key as 400 INVALID_ARGUMENT "API key not valid".
    if (response.status === 401 || response.status === 403 || (response.status === 400 && /api.?key/i.test(text))) {
      throw new AIProviderError('AI_KEY_INVALID', `${label} rejected the API key (${response.status}). Update it in Settings, API Keys.`);
    }
    if (response.status === 429) {
      throw new AIProviderError('AI_RATE_LIMITED', `${label} rate limit or quota reached (429). Wait a minute or use another key.`);
    }
    throw new AIProviderError('AI_PROVIDER_ERROR', `${label} API error (${response.status}): ${text}`);
  }
  return response.json();
}

type ProviderCall = (
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  model: string,
) => Promise<string>;

interface ProviderConfig {
  /** Model used when neither the request nor an env override specifies one. */
  defaultModel: string;
  /** Env var that overrides the model at runtime (e.g. OPENROUTER_MODEL). */
  modelEnvVar: string;
  call: ProviderCall;
}

// OpenAI-wire-compatible chat completions — shared by OpenAI and OpenRouter.
async function callOpenAICompatible(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  opts: {
    baseUrl: string;
    label: string;
    extraHeaders?: Record<string, string>;
    jsonResponseFormat?: boolean;
  },
): Promise<string> {
  const data = await postJson(
    opts.label,
    `${opts.baseUrl}/chat/completions`,
    { Authorization: `Bearer ${apiKey}`, ...opts.extraHeaders },
    {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 4096,
      // Only OpenAI reliably honors json_object; many free OpenRouter models reject it,
      // so it is opt-in. The JSON contract is still enforced by the prompt + parseModelJson.
      ...(opts.jsonResponseFormat ? { response_format: { type: 'json_object' } } : {}),
    },
  );
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new AIProviderError('AI_BAD_OUTPUT', `${opts.label} returned no usable content (model ${model})`);
  }
  return content;
}

async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  model: string,
): Promise<string> {
  const data = await postJson(
    'Anthropic',
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    { model, max_tokens: 4096, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] },
  );
  // Anthropic returns content as an array of blocks.
  const textBlock = data?.content?.find?.((b: { type: string }) => b.type === 'text');
  const content = textBlock?.text ?? '';
  if (typeof content !== 'string' || content.length === 0) {
    throw new AIProviderError('AI_BAD_OUTPUT', 'Anthropic returned no usable content');
  }
  return content;
}

async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  model: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const data = await postJson('Gemini', url, {}, {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts: [{ text: userPrompt }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 4096, responseMimeType: 'application/json' },
  });
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof content !== 'string' || content.length === 0) {
    throw new AIProviderError('AI_BAD_OUTPUT', 'Gemini returned no usable content');
  }
  return content;
}

const PROVIDERS: Record<ApiKeyProvider, ProviderConfig> = {
  openai: {
    defaultModel: 'gpt-4o',
    modelEnvVar: 'OPENAI_MODEL',
    call: (apiKey, systemPrompt, userPrompt, model) =>
      callOpenAICompatible(apiKey, systemPrompt, userPrompt, model, {
        baseUrl: 'https://api.openai.com/v1',
        label: 'OpenAI',
        jsonResponseFormat: true,
      }),
  },
  openrouter: {
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    modelEnvVar: 'OPENROUTER_MODEL',
    call: (apiKey, systemPrompt, userPrompt, model) =>
      callOpenAICompatible(apiKey, systemPrompt, userPrompt, model, {
        baseUrl: 'https://openrouter.ai/api/v1',
        label: 'OpenRouter',
        extraHeaders: { 'HTTP-Referer': 'https://qaforge.dev', 'X-Title': 'QA Forge' },
      }),
  },
  anthropic: {
    defaultModel: 'claude-haiku-4-5-20251001',
    modelEnvVar: 'ANTHROPIC_MODEL',
    call: callAnthropic,
  },
  gemini: {
    defaultModel: 'gemini-2.0-flash',
    modelEnvVar: 'GEMINI_MODEL',
    call: callGemini,
  },
};

/** Resolve the model: explicit request override > env override > provider default. */
function resolveModel(provider: ApiKeyProvider, requestModel?: string): string {
  const config = PROVIDERS[provider];
  return requestModel || envValue(config.modelEnvVar) || config.defaultModel;
}

/** Dispatch a generation to the configured provider. Throws for unknown providers. */
async function callProvider(
  provider: ApiKeyProvider,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  requestModel?: string,
): Promise<{ content: string; model: string }> {
  const config = PROVIDERS[provider];
  if (!config) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  const model = resolveModel(provider, requestModel);
  return { content: await config.call(apiKey, systemPrompt, userPrompt, model), model };
}

/** Parse model text as JSON; unparseable output is a provider failure the user can retry. */
function parseOutput(raw: string): unknown {
  try {
    return parseModelJson(raw);
  } catch {
    throw new AIProviderError('AI_BAD_OUTPUT', 'The AI response was not valid JSON. Try again or pick another model.');
  }
}

// Parse a model's raw text into JSON, tolerating the common ways models wrap it:
// raw JSON, a ```json fenced block, or JSON embedded in surrounding prose. Each
// strategy is attempted in turn; a single clear error is thrown only if all fail.
export function parseModelJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // not raw JSON — try the next strategy
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // fenced block was not valid JSON — try the next strategy
    }
  }

  // Last resort: slice from the first JSON bracket to the last closing bracket,
  // which recovers JSON emitted alongside explanatory prose.
  const start = raw.search(/[[{]/);
  const end = Math.max(raw.lastIndexOf(']'), raw.lastIndexOf('}'));
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      // give up below
    }
  }

  throw new Error('Failed to parse AI response as JSON');
}

// ── Main Generation Function ─────────────────────────────────────────────────

/**
 * Generate test cases using the specified AI provider.
 *
 * Returns an array of generated test case objects ready to be inserted into the database.
 */
export async function generateTestCases(
  request: GenerateTestCasesRequest,
): Promise<GenerateTestCasesResponse> {
  const startTime = Date.now();
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(request.prompt, request.baseUrl);

  const { content, model } = await callProvider(
    request.provider,
    request.apiKey,
    systemPrompt,
    userPrompt,
    request.model,
  );

  // Parse the AI response — handle raw array, { test_cases: [...] } wrapper,
  // fenced blocks, and JSON embedded in prose.
  const parsed: unknown = parseOutput(content);

  let rawCases: unknown[];
  if (Array.isArray(parsed)) {
    rawCases = parsed;
  } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { test_cases?: unknown }).test_cases)) {
    rawCases = (parsed as { test_cases: unknown[] }).test_cases;
  } else {
    throw new AIProviderError('AI_BAD_OUTPUT', 'AI response did not contain a valid test cases array');
  }

  const testCases: GeneratedTestCase[] = [];
  const rejected: GenerateTestCasesResponse['rejected'] = [];
  for (const raw of rawCases) {
    const r = validateGeneratedCase(raw);
    if (r.ok) testCases.push(r.testCase);
    else rejected.push({ title: r.title, errors: r.errors });
  }
  if (testCases.length === 0) {
    throw new AIProviderError(
      'AI_BAD_OUTPUT',
      `AI returned ${rawCases.length} test case(s) but none matched the step contract: ` +
        (rejected[0]?.errors.slice(0, 3).join('; ') ?? 'empty response'),
    );
  }

  return {
    test_cases: testCases,
    rejected,
    provider_used: request.provider,
    model_used: model,
    generation_time_ms: Date.now() - startTime,
  };
}

// ── Optimize Test Case ────────────────────────────────────────────────────────

export interface OptimizeTestCaseRequest {
  title: string;
  description?: string;
  steps: TestCaseStep[];
  expected_result?: string;
  provider: ApiKeyProvider;
  apiKey: string;
  baseUrl?: string;
  /** Optional per-request model override (else env override, else provider default) */
  model?: string;
}

export interface OptimizedTestCaseResponse {
  test_case: GeneratedTestCase;
  provider_used: ApiKeyProvider;
  model_used: string;
  optimization_time_ms: number;
}

function buildOptimizeSystemPrompt(): string {
  return `You are an expert QA engineer and test automation specialist. Your job is to optimize a basic manually-written test case, turning it into a highly descriptive, well-structured test case with precise Playwright-style steps.

RULES:
1. Retain the core intent of the original test case, but make the title and description more professional.
2. Review the steps and optimize them. Expand vague instructions (e.g. "log in") into specific, detailed actions (e.g. "Fill #email-input with test user and click submit").
3. Suggest appropriate CSS selectors for interactive elements in the selector field (e.g. input[type="email"], button[type="submit"]).
4. Ensure the expected_result is clear and concrete.
5. Provide tags and assign a realistic priority.
6. Return only the optimized test case object.

OUTPUT FORMAT:
Return a JSON object containing:
- title: string — professional title
- description: string — improved, clear description
- steps: ${STEP_FORMAT}
- expected_result: string — concrete expected outcome
- priority: "critical" | "high" | "medium" | "low"
- type: "functional" | "regression" | "smoke" | "edge_case" | "accessibility" | "negative"
- tags: string[]

Return ONLY valid JSON. No markdown fences. No explanatory text.`;
}

function buildOptimizeUserPrompt(request: OptimizeTestCaseRequest): string {
  return `Optimize the following manual test case:

Title: ${request.title}
Description: ${request.description || 'None'}
Expected Result: ${request.expected_result || 'None'}
Application Base URL: ${request.baseUrl || 'None'}

Current Steps:
${JSON.stringify(request.steps, null, 2)}`;
}

export async function optimizeTestCase(
  request: OptimizeTestCaseRequest,
): Promise<OptimizedTestCaseResponse> {
  const startTime = Date.now();
  const systemPrompt = buildOptimizeSystemPrompt();
  const userPrompt = buildOptimizeUserPrompt(request);

  const { content, model } = await callProvider(
    request.provider,
    request.apiKey,
    systemPrompt,
    userPrompt,
    request.model,
  );

  const parsed: unknown = parseOutput(content);

  const r = validateGeneratedCase(parsed);
  if (!r.ok) {
    throw new AIProviderError(
      'AI_BAD_OUTPUT',
      `Optimized test case did not match the step contract: ${r.errors.slice(0, 3).join('; ')}`,
    );
  }

  return {
    test_case: r.testCase,
    provider_used: request.provider,
    model_used: model,
    optimization_time_ms: Date.now() - startTime,
  };
}

export { type ApiKeyProvider } from '@qaforge/shared-types';
export { LOCAL_DEMO_LABEL, LOCAL_DEMO_PROVIDER, localDemoTestCases } from './local-demo.js';
