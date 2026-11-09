/**
 * A line diff (LCS), for reviewing a proposed SKILL.md against the current one.
 *
 * Small on purpose: skill documents are hundreds of lines at most, so the
 * O(n·m) table is fine and a dependency is not worth it. Inputs above
 * `MAX_CELLS` fall back to "everything removed, everything added", which is
 * still correct, just not minimal.
 */

export type DiffOp = 'same' | 'add' | 'del';

export interface DiffLine {
  op: DiffOp;
  text: string;
}

const MAX_CELLS = 4_000_000;

export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before === '' ? [] : before.replace(/\r\n/g, '\n').split('\n');
  const b = after === '' ? [] : after.replace(/\r\n/g, '\n').split('\n');
  if (a.length * b.length > MAX_CELLS) {
    return [...a.map((text) => ({ op: 'del' as const, text })), ...b.map((text) => ({ op: 'add' as const, text }))];
  }
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: 'same', text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ op: 'del', text: a[i++] });
    } else {
      out.push({ op: 'add', text: b[j++] });
    }
  }
  while (i < n) out.push({ op: 'del', text: a[i++] });
  while (j < m) out.push({ op: 'add', text: b[j++] });
  return out;
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((l) => l.op === 'add').length,
    removed: lines.filter((l) => l.op === 'del').length,
  };
}
