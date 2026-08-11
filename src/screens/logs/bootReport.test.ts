import { describe, expect, it } from 'vitest';
import { buildBootReport, diffBoots, parseSetting, READY_MARKER } from './bootReport';
import type { LogLevel, LogRecord } from '@/ipc/types';

let seq = 0;
function rec(message: string, level: LogLevel = 'info', component = 'kernel'): LogRecord {
  seq += 1;
  return {
    seq,
    at_unix_ms: 1_000_000 + seq * 100,
    level,
    component,
    message,
    attrs: [],
    boot_id: 'boot-a',
    truncated: false,
  };
}

describe('boot setting parser — against lines the kernel really emits', () => {
  it('parses the ENABLED shape with its detail', () => {
    const s = parseSetting(rec('ADR-0079: pre-plan Scout ENABLED (deterministic-first discovery)'));
    expect(s).not.toBeNull();
    expect(s!.component).toBe('ADR-0079');
    expect(s!.subject).toBe('pre-plan Scout');
    expect(s!.state).toBe('enabled');
    expect(s!.detail).toBe('deterministic-first discovery');
  });

  it('handles a component with a sub-reference', () => {
    const s = parseSetting(rec('ADR-0053 D2: kg_extractor ENABLED (deterministic metadata)'));
    expect(s!.component).toBe('ADR-0053 D2');
    expect(s!.subject).toBe('kg_extractor');
  });

  it('handles a non-ADR prefix', () => {
    const s = parseSetting(
      rec('AGENTIC_RETRIEVAL_SPEC: agentic retrieval query-planner ENABLED (retrieval_agent)'),
    );
    expect(s!.component).toBe('AGENTIC_RETRIEVAL_SPEC');
    expect(s!.state).toBe('enabled');
  });

  it('treats `active` as a declaration too', () => {
    expect(parseSetting(rec('ADR-0098: conversation progress channel active'))!.state).toBe(
      'active',
    );
  });

  // Ordinary prose must not become a setting, or the report fills with noise
  // and stops being the answer to "what is this kernel running".
  it('ignores a line that merely mentions the word', () => {
    expect(parseSetting(rec('telemetry: no exporter configured, all metrics dropped'))).toBeNull();
    expect(parseSetting(rec('the session is still active and running'))).toBeNull();
  });

  // Relayed agent output is not the kernel's own boot.
  it('ignores agent output', () => {
    const r = rec('daemon: telegram ingress ENABLED');
    r.attrs = [{ key: 'agent_id', kind: 'string', value: 'telegram_ingress_agent', num: null }];
    expect(parseSetting(r)).toBeNull();
  });
});

describe('boot window', () => {
  it('ends at the readiness marker, so a slow boot is not cut short', () => {
    const records = [
      rec('ADR-0074: plugin registered'),
      rec('ADR-0079: pre-plan Scout ENABLED (x)'),
      rec(`🧬 ${READY_MARKER}`),
      rec('a later runtime line'),
      rec('another later line'),
    ];
    const report = buildBootReport(records)!;
    expect(report.lineCount).toBe(3);
    expect(report.settings).toHaveLength(1);
  });

  // Guessing a boundary would present a partial report as a whole one.
  it('returns null when the marker has scrolled out of the window', () => {
    expect(buildBootReport([rec('ADR-0074: plugin registered')])).toBeNull();
  });

  it('collects boot warnings, which are the highest-consequence lines', () => {
    const records = [
      rec('ADR-0043: MCP server connect failed (skipping)', 'warn'),
      rec('operator audit store unavailable', 'error'),
      rec(`🧬 ${READY_MARKER}`),
    ];
    const report = buildBootReport(records)!;
    expect(report.warnings).toHaveLength(2);
  });
});

describe('boot diff — the useful question is what CHANGED', () => {
  function reportOf(lines: string[]) {
    return buildBootReport([...lines.map((l) => rec(l)), rec(`🧬 ${READY_MARKER}`)])!;
  }

  it('reports added, removed and changed', () => {
    const before = reportOf([
      'ADR-0053: kg_extractor ENABLED (x)',
      'ADR-0054: hybrid retrieval ENABLED (y)',
    ]);
    const after = reportOf([
      'ADR-0053: kg_extractor DISABLED (x)',
      'ADR-0079: pre-plan Scout ENABLED (z)',
    ]);

    const diffs = diffBoots(before, after);
    const bySubject = Object.fromEntries(diffs.map((d) => [d.subject, d]));

    // The class of bug this exists to catch: a setting silently turned off.
    expect(bySubject['kg_extractor'].kind).toBe('changed');
    expect(bySubject['kg_extractor'].before).toBe('enabled');
    expect(bySubject['kg_extractor'].after).toBe('disabled');

    expect(bySubject['pre-plan Scout'].kind).toBe('added');
    expect(bySubject['hybrid retrieval'].kind).toBe('removed');
  });

  it('is empty when nothing moved', () => {
    const a = reportOf(['ADR-0053: kg_extractor ENABLED (x)']);
    const b = reportOf(['ADR-0053: kg_extractor ENABLED (x)']);
    expect(diffBoots(a, b)).toHaveLength(0);
  });
});
