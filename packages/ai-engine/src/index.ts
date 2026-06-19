import type { ApiKeyProvider, TestCaseStep } from '@qaforge/shared-types';

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

export interface GeneratedTestCase {
  title: string;
  description: string;
  steps: TestCaseStep[];
  expected_result: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  type: 'functional' | 'regression' | 'smoke' | 'edge_case' | 'accessibility' | 'negative';
  tags: string[];
}

export interface GenerateTestCasesResponse {
  test_cases: GeneratedTestCase[];
  provider_used: ApiKeyProvider;
  generation_time_ms: number;
}

// ── Prompt Template ──────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are an expert QA engineer and test automation specialist. Your job is to generate comprehensive, well-structured test cases from a natural language description of a feature or user flow.

RULES:
1. Generate between 3 and 8 test cases per request — aim for full coverage.
2. Always include a mix of positive (happy path), negative (error handling), and edge case tests.
3. Each test case must have clear, actionable steps written in natural language.
4. Steps should be specific enough to translate into Playwright actions (click, fill, navigate, assert).
5. Use CSS selectors where possible in the selector field (e.g., button[type="submit"], #email-input, .login-form).
6. Prioritize critical user-facing flows as "high" or "critical" priority.
7. Include accessibility test cases when relevant.

OUTPUT FORMAT:
Return a JSON array of test case objects. Each object must have:
- title: string — concise test case name
- description: string — what this test validates
- steps: array of { step_number, instruction, selector?, value?, expected? }
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
  const response = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...opts.extraHeaders,
    },
    body: JSON.stringify({
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
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`${opts.label} API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error(`${opts.label} returned no usable content (model ${model})`);
  }
  return content;
}

async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  model: string,
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  // Anthropic returns content as an array of blocks.
  const textBlock = data?.content?.find?.((b: { type: string }) => b.type === 'text');
  const content = textBlock?.text ?? '';
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('Anthropic returned no usable content');
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

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('Gemini returned no usable content');
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
): Promise<string> {
  const config = PROVIDERS[provider];
  if (!config) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  return config.call(apiKey, systemPrompt, userPrompt, resolveModel(provider, requestModel));
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

  const rawResponse = await callProvider(
    request.provider,
    request.apiKey,
    systemPrompt,
    userPrompt,
    request.model,
  );

  // Parse the AI response — handle raw array, { test_cases: [...] } wrapper,
  // fenced blocks, and JSON embedded in prose.
  const parsed: unknown = parseModelJson(rawResponse);

  let testCases: GeneratedTestCase[];
  if (Array.isArray(parsed)) {
    testCases = parsed as GeneratedTestCase[];
  } else if (parsed && typeof parsed === 'object' && 'test_cases' in parsed) {
    testCases = (parsed as { test_cases: GeneratedTestCase[] }).test_cases;
  } else {
    throw new Error('AI response did not contain a valid test cases array');
  }

  // Validate and normalize step_numbers
  for (const tc of testCases) {
    if (!Array.isArray(tc.steps)) tc.steps = [];
    tc.steps = tc.steps.map((step, idx) => ({
      step_number: idx + 1,
      instruction: step.instruction || '',
      selector: step.selector,
      value: step.value,
      expected: step.expected,
    }));
    // Ensure defaults
    tc.priority = tc.priority || 'medium';
    tc.type = tc.type || 'functional';
    tc.tags = tc.tags || [];
  }

  return {
    test_cases: testCases,
    provider_used: request.provider,
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
- steps: array of { step_number, instruction, selector?, value?, expected? } — precise steps
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

  const rawResponse = await callProvider(
    request.provider,
    request.apiKey,
    systemPrompt,
    userPrompt,
    request.model,
  );

  const parsed: unknown = parseModelJson(rawResponse);

  const tc = parsed as GeneratedTestCase;
  if (!Array.isArray(tc.steps)) tc.steps = [];
  tc.steps = tc.steps.map((step, idx) => ({
    step_number: idx + 1,
    instruction: step.instruction || '',
    selector: step.selector,
    value: step.value,
    expected: step.expected,
  }));
  tc.priority = tc.priority || 'medium';
  tc.type = tc.type || 'functional';
  tc.tags = tc.tags || [];

  return {
    test_case: tc,
    provider_used: request.provider,
    optimization_time_ms: Date.now() - startTime,
  };
}

export { type ApiKeyProvider } from '@qaforge/shared-types';
