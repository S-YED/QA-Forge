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

// ── Provider Clients ─────────────────────────────────────────────────────────

async function callOpenAI(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callAnthropic(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  // Anthropic returns content as an array of blocks
  const textBlock = data.content.find((b: { type: string }) => b.type === 'text');
  return textBlock?.text ?? '';
}

async function callGemini(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [
        { parts: [{ text: userPrompt }] },
      ],
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
  return data.candidates[0].content.parts[0].text;
}

// OpenRouter is OpenAI-wire-compatible. The model is overridable via OPENROUTER_MODEL
// and defaults to a reliable free instruct model. `response_format` is intentionally
// omitted for broad free-model compatibility — the JSON contract is enforced by the
// system prompt plus the markdown-fence fallback parser used by the callers.
const OPENROUTER_MODEL =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';

async function callOpenRouter(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://qaforge.dev',
      'X-Title': 'QA Forge',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error(`OpenRouter returned no usable content (model ${OPENROUTER_MODEL})`);
  }
  return content;
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

  let rawResponse: string;

  switch (request.provider) {
    case 'openai':
      rawResponse = await callOpenAI(request.apiKey, systemPrompt, userPrompt);
      break;
    case 'anthropic':
      rawResponse = await callAnthropic(request.apiKey, systemPrompt, userPrompt);
      break;
    case 'gemini':
      rawResponse = await callGemini(request.apiKey, systemPrompt, userPrompt);
      break;
    case 'openrouter':
      rawResponse = await callOpenRouter(request.apiKey, systemPrompt, userPrompt);
      break;
    default:
      throw new Error(`Unsupported provider: ${request.provider}`);
  }

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

  let rawResponse: string;

  switch (request.provider) {
    case 'openai':
      rawResponse = await callOpenAI(request.apiKey, systemPrompt, userPrompt);
      break;
    case 'anthropic':
      rawResponse = await callAnthropic(request.apiKey, systemPrompt, userPrompt);
      break;
    case 'gemini':
      rawResponse = await callGemini(request.apiKey, systemPrompt, userPrompt);
      break;
    case 'openrouter':
      rawResponse = await callOpenRouter(request.apiKey, systemPrompt, userPrompt);
      break;
    default:
      throw new Error(`Unsupported provider: ${request.provider}`);
  }

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
