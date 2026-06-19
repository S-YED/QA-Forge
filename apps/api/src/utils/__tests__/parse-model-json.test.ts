import { describe, it, expect } from 'vitest';
import { parseModelJson } from '@qaforge/ai-engine';

// parseModelJson hardens AI-response parsing so that models which wrap JSON in
// prose or fenced blocks (common with free/OpenRouter models) still produce
// usable output instead of a 500. See ai-engine/src/index.ts.

describe('parseModelJson', () => {
  it('parses raw JSON arrays and objects', () => {
    expect(parseModelJson('[{"title":"A"}]')).toEqual([{ title: 'A' }]);
    expect(parseModelJson('{"test_cases":[]}')).toEqual({ test_cases: [] });
  });

  it('extracts JSON from a ```json fenced block', () => {
    const raw = 'Here you go:\n```json\n[{"title":"B"}]\n```\nHope that helps!';
    expect(parseModelJson(raw)).toEqual([{ title: 'B' }]);
  });

  it('extracts JSON embedded in surrounding prose (no fences)', () => {
    const raw = 'Sure! The test cases are: [{"title":"C"}] — let me know if you need more.';
    expect(parseModelJson(raw)).toEqual([{ title: 'C' }]);
  });

  it('recovers an object emitted with a trailing explanation', () => {
    const raw = '{"title":"D","steps":[]}\n\nThis covers the happy path.';
    expect(parseModelJson(raw)).toEqual({ title: 'D', steps: [] });
  });

  it('throws a single clear error when no JSON is present', () => {
    expect(() => parseModelJson('I cannot help with that request.')).toThrow(
      /Failed to parse AI response as JSON/,
    );
  });
});
