import { describe, expect, it } from 'vitest';
import { keepBothName, nextFreeUploadName, splitUploadName } from './uploadNames';

describe('keep-both upload names (ADR-0138 B1.3)', () => {
  it('splits base, number and extension', () => {
    expect(splitUploadName('report.pdf')).toEqual({ base: 'report', n: 1, ext: '.pdf' });
    expect(splitUploadName('report (2).pdf')).toEqual({ base: 'report', n: 2, ext: '.pdf' });
    expect(splitUploadName('notes')).toEqual({ base: 'notes', n: 1, ext: '' });
    expect(splitUploadName('archive.tar.gz')).toEqual({ base: 'archive.tar', n: 1, ext: '.gz' });
    expect(splitUploadName('.env')).toEqual({ base: '.env', n: 1, ext: '' });
  });

  it('spells "<base> (n).<ext>"', () => {
    expect(keepBothName('report.pdf', 2)).toBe('report (2).pdf');
    expect(keepBothName('report (2).pdf', 3)).toBe('report (3).pdf');
    expect(keepBothName('notes', 2)).toBe('notes (2)');
  });

  it('takes the next number the kernel reports free', async () => {
    const taken = new Set(['report (2).pdf', 'report (3).pdf']);
    const asked: string[] = [];
    const name = await nextFreeUploadName('report.pdf', async (c) => {
      asked.push(c);
      return taken.has(c);
    });
    expect(name).toBe('report (4).pdf');
    expect(asked).toEqual(['report (2).pdf', 'report (3).pdf', 'report (4).pdf']);
  });

  it('starts above the number a name already carries, and gives up when bounded', async () => {
    expect(await nextFreeUploadName('report (5).pdf', async () => false)).toBe('report (6).pdf');
    await expect(nextFreeUploadName('x.pdf', async () => true, 3)).rejects.toThrow(/no free name/);
  });
});
