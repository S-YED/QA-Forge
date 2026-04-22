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
    default:
      throw new Error(`Unsupported provider: ${request.provider}`);
  }

  // Parse the AI response — handle both raw array and { test_cases: [...] } wrapper
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawResponse);
  } catch {
    // Try to extract JSON from markdown fences if the model wrapped it
    const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error('Failed to parse AI response as JSON');
    }
  }

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

export { type ApiKeyProvider } from '@qaforge/shared-types';
