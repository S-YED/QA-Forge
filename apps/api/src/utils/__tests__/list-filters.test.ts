import { describe, expect, it } from 'vitest';
import { containsAny, daysParam, searchParam } from '../list-filters.js';

describe('F6 list filters', () => {
  it('builds one condition per column', () => {
    expect(containsAny(['title', 'description'], 'login')).toBe('title.ilike."%login%",description.ilike."%login%"');
  });

  it('keeps wildcards and filter syntax in the search text literal', () => {
    // % and _ would match anything; a comma, bracket or quote would otherwise end the value.
    expect(containsAny(['title'], '50%_off')).toBe('title.ilike."%50\\\\%\\\\_off%"');
    expect(containsAny(['title'], 'a,b)"c')).toBe('title.ilike."%a,b)\\"c%"');
  });

  it('accepts sensible values only', () => {
    expect(daysParam.parse('7')).toBe(7);
    expect(daysParam.safeParse('0').success).toBe(false);
    expect(daysParam.safeParse('abc').success).toBe(false);
    expect(searchParam.parse('  cart ')).toBe('cart');
    expect(searchParam.safeParse('   ').success).toBe(false);
    expect(searchParam.safeParse('x'.repeat(101)).success).toBe(false);
  });
});
