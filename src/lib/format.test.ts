import { describe, it, expect } from 'vitest';
import {
  badgeCount,
  formatDuration,
  formatRelativeTime,
  formatTokenRate,
  formatTokens,
  sessionSubject,
} from './format';

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

describe('sessionSubject', () => {
  it('takes the first clause as the heading', () => {
    expect(
      sessionSubject('Find the airline routes, then compare them against ARMATA coverage'),
    ).toBe('Find the airline routes');
  });

  it('caps a long single clause and breaks on a word, never mid-word', () => {
    const subject = sessionSubject(
      'Summarise every incident report filed by the operations team during the last quarter',
    );
    expect(subject.length).toBeLessThanOrEqual(49);
    expect(subject.endsWith('…')).toBe(true);
    // The whole reason this helper exists: the previous heading was the raw
    // goal, truncated, which cut words in half.
    expect(subject.replace('…', '').trim()).not.toMatch(/\s\S{1,2}$/);
  });

  it('capitalises the first letter without touching the rest', () => {
    expect(sessionSubject('review the ARMATA gaps')).toBe('Review the ARMATA gaps');
  });

  it('never returns an empty heading', () => {
    expect(sessionSubject('')).toBe('Untitled session');
    expect(sessionSubject('   ')).toBe('Untitled session');
  });
});

describe('formatTokens', () => {
  // Every "cost" in this console is a token count. A completion response carries
  // token counts and never a price, so any $ figure here was invented from a
  // rate nobody reconciled — a wrong-units bug, not a rounding one.
  it('reads in the largest useful unit', () => {
    expect(formatTokens(842)).toBe('842');
    expect(formatTokens(1_400)).toBe('1.4k');
    expect(formatTokens(208_000)).toBe('208k');
    expect(formatTokens(1_400_000)).toBe('1.4M');
    expect(formatTokens(7_600_000)).toBe('7.6M');
  });

  it('never renders a fraction of a token', () => {
    expect(formatTokens(842.6)).toBe('843');
  });

  it('survives a non-finite or negative count', () => {
    expect(formatTokens(NaN)).toBe('0');
    expect(formatTokens(-5)).toBe('0');
  });

  it('renders a rate with its unit', () => {
    expect(formatTokenRate(1_400_000)).toBe('1.4M tok/hr');
  });
});

describe('formatDuration', () => {
  it('reads in the largest useful unit', () => {
    expect(formatDuration(41_000)).toBe('41s');
    expect(formatDuration(260_000)).toBe('4m 20s');
    expect(formatDuration(7_500_000)).toBe('2h 5m');
  });
});

describe('badgeCount', () => {
  it('is null at zero, so a zero badge can never be rendered', () => {
    // A "0" badge draws the eye to something that is not happening, which is
    // exactly backwards for an inbox.
    expect(badgeCount(0)).toBeNull();
    expect(badgeCount(-1)).toBeNull();
    expect(badgeCount(3)).toBe(3);
  });
});
