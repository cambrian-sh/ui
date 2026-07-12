import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from './format';

describe('formatRelativeTime', () => {
  it('returns Just now for recent dates', () => {
    expect(formatRelativeTime(new Date().toISOString())).toBe('Just now');
  });

  it('returns Unknown for invalid dates', () => {
    expect(formatRelativeTime('invalid-date')).toBe('Unknown');
  });

  it('returns Unknown for empty string', () => {
    expect(formatRelativeTime('')).toBe('Unknown');
  });

  it('returns minutes ago', () => {
    const twoMinsAgo = new Date(Date.now() - 120000).toISOString();
    expect(formatRelativeTime(twoMinsAgo)).toMatch(/\d+m ago/);
  });

  it('returns Just now for future dates', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    expect(formatRelativeTime(tomorrow)).toBe('Just now');
  });
});
