/**
 * "Keep both" naming for an upload whose name the operator already stores
 * (ADR-0138 Amendment B1.3).
 *
 * The kernel keys an operator upload by (operator, classification scope,
 * normalised file name), so the ONLY way to keep a second copy is to send a
 * different name: "report.pdf" → "report (2).pdf", then "(3)", … The next free
 * number is found by asking the kernel (`matchUpload`), never by re-implementing
 * its normalisation here — this module only spells candidate names.
 */

/** Splits "report (2).pdf" into { base: "report", n: 2, ext: ".pdf" }. */
export function splitUploadName(name: string): { base: string; n: number; ext: string } {
  const dot = name.lastIndexOf('.');
  // A leading dot (".env") or no dot is a name with no extension.
  const hasExt = dot > 0 && dot < name.length - 1;
  const stem = hasExt ? name.slice(0, dot) : name;
  const ext = hasExt ? name.slice(dot) : '';
  const m = /^(.*\S) \((\d+)\)$/.exec(stem);
  if (m) return { base: m[1], n: Number(m[2]), ext };
  return { base: stem, n: 1, ext };
}

/** The `n`th "keep both" name of `name`: "<base> (n).<ext>". */
export function keepBothName(name: string, n: number): string {
  const { base, ext } = splitUploadName(name);
  return `${base} (${n})${ext}`;
}

/**
 * The first "<base> (n).<ext>" (n ≥ 2, above any number the name already carries)
 * that `isTaken` reports free. Bounded: after `limit` tries it gives up rather than
 * loop on a kernel that answers "taken" for everything.
 */
export async function nextFreeUploadName(
  name: string,
  isTaken: (candidate: string) => Promise<boolean>,
  limit = 50,
): Promise<string> {
  const start = Math.max(2, splitUploadName(name).n + 1);
  for (let n = start; n < start + limit; n++) {
    const candidate = keepBothName(name, n);
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error(`no free name for "${name}" after ${limit} tries`);
}
