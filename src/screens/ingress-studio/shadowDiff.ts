/**
 * §3.2 — the shadow reprocess, as three numbers.
 *
 * # Measured, not predicted
 *
 * Because raw is archived BEFORE anything interprets it, a revised mapping can
 * be replayed over the same archived deliveries and report what actually
 * changes. That is what turns "the coordinates look transposed" from a suspicion
 * you cannot check into `1 402 — every record gets a different location, and r7
 * has been writing them since 19 Jul`. Without archived raw there is no way to
 * size the change, and no way to know it is real.
 *
 * # Records, not projections
 *
 * Every count here is DISTINCT EVIDENCE, not rows in the diff. One delivery can
 * produce several projections, so counting rows would report a number larger
 * than the number of things that arrived — and an operator reading "1 402
 * records" against a 1 402-delivery archive would be reading a coincidence.
 */

/** The kernel's RepairPreview, as it marshals over the wire (Go field names). */
export interface RepairPreview {
  IngressID?: string;
  CandidateRevision?: number;
  EvidenceExamined?: number;
  Unchanged?: number;
  Additions?: ProjectionChange[];
  Removals?: ProjectionChange[];
  Changes?: ProjectionChange[];
  NewRefusals?: EvidenceOutcome[];
  ResolvedRefusals?: EvidenceOutcome[];
  NewDiscards?: EvidenceOutcome[];
}

interface ProjectionChange {
  EvidenceID?: string;
  Kind?: string;
  BaseRef?: string;
  OldDigest?: string;
  NewDigest?: string;
}

interface EvidenceOutcome {
  EvidenceID?: string;
  DeliveryRef?: string;
  Detail?: string;
}

export type ShadowNumbers = {
  /** How many archived deliveries were replayed. The denominator. */
  examined: number;
  /** Records whose output differs. THE FINDING. */
  changed: number;
  /** Records that gain something they did not have. */
  gained: number;
  /**
   * Records the candidate would DROP that the live revision kept.
   *
   * Reported even when it is zero, and that is the whole point: this is the
   * number that silently loses data, and a screen that only showed it when it
   * was non-zero would be a screen you cannot use to rule it out.
   */
  dropped: number;
  /** Records that come out identical — the reassuring bulk. */
  unchanged: number;
};

export function shadowNumbers(p: RepairPreview | null): ShadowNumbers {
  if (!p) {
    return { examined: 0, changed: 0, gained: 0, dropped: 0, unchanged: 0 };
  }
  return {
    examined: p.EvidenceExamined ?? 0,
    changed: distinct(p.Changes),
    // A record that projects where nothing projected before has gained
    // everything, not merely a field, so a resolved refusal counts here.
    gained: distinctAcross([p.Additions, p.ResolvedRefusals]),
    // Three different ways to lose a record, and they are one number to an
    // operator: it is no longer stored. Separating them here would be a
    // taxonomy lesson in the middle of a safety check.
    dropped: distinctAcross([p.Removals, p.NewDiscards, p.NewRefusals]),
    unchanged: p.Unchanged ?? 0,
  };
}

function distinct(rows: Array<{ EvidenceID?: string }> | undefined): number {
  return new Set((rows ?? []).map((r) => r.EvidenceID ?? "")).size;
}

function distinctAcross(
  groups: Array<Array<{ EvidenceID?: string }> | undefined>,
): number {
  const s = new Set<string>();
  for (const g of groups ?? []) {
    for (const r of g ?? []) s.add(r.EvidenceID ?? "");
  }
  return s.size;
}

export function parsePreview(raw: string | undefined): RepairPreview | null {
  if (!raw || raw === "") return null;
  try {
    return JSON.parse(raw) as RepairPreview;
  } catch {
    return null;
  }
}
