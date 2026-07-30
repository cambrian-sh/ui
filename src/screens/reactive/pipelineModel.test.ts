import { describe, expect, it } from 'vitest';
import {
  dangerousPayloadKeys,
  debounceFinding,
  emptyPipeline,
  isLlmGate,
  pipelineMode,
  suggestsDeterministic,
  summariseBacktest,
} from './pipelineModel';
import type { WatchBacktestVerdict, WatchConfigFull } from '@/ipc/types';

function config(over: Partial<WatchConfigFull> = {}): WatchConfigFull {
  return { ...emptyPipeline(), id: 'w1', source_stream_id: 'prices', ...over };
}

function verdict(over: Partial<WatchBacktestVerdict> = {}): WatchBacktestVerdict {
  return { seq: 1, stream_id: 'prices', raw_text: '{}', would_fire: false, eval_error: '', ...over };
}

describe('pipelineMode', () => {
  it('calls a watch with no stream broken, not paused', () => {
    // The distinction that matters: paused is a decision, broken is an accident
    // that looks exactly like coverage.
    expect(pipelineMode(config({ source_stream_id: '', active: true }))).toBe('broken');
  });

  it('does not call a schedule watch broken for having no stream', () => {
    // A cron source has no stream by design.
    expect(
      pipelineMode(config({ source_stream_id: '', source_type: 'schedule', active: true, dry_run: false })),
    ).toBe('armed');
  });

  it('reports dry run ahead of active, because nothing has acted', () => {
    expect(pipelineMode(config({ active: true, dry_run: true }))).toBe('dry_run');
  });

  it('reports paused when it is registered but switched off', () => {
    expect(pipelineMode(config({ active: false, dry_run: false }))).toBe('paused');
  });

  it('reports armed when it is live', () => {
    expect(pipelineMode(config({ active: true, dry_run: false }))).toBe('armed');
  });
});

describe('the llm gate as a security surface', () => {
  it('recognises an llm condition', () => {
    expect(isLlmGate(config({ condition_type: 'llm' }))).toBe(true);
    expect(isLlmGate(config({ condition_type: 'deterministic' }))).toBe(false);
  });

  it('names free-form third-party text as the dangerous field', () => {
    // A number cannot carry an instruction; a headline can.
    const dangerous = dangerousPayloadKeys(['price', 'headline', 'volume', 'raw_text']);
    expect(dangerous).toEqual(['headline', 'raw_text']);
  });

  it('argues against itself when a deterministic gate would be exact', () => {
    // The best LLM-condition UI is one that talks you out of an LLM condition
    // you do not need.
    expect(
      suggestsDeterministic(
        config({
          condition_type: 'llm',
          condition: 'fire when price exceeds 400',
          condition_payload_keys: ['price'],
        }),
      ),
    ).toBe(true);
  });

  it('does not argue against a genuinely qualitative condition', () => {
    expect(
      suggestsDeterministic(
        config({
          condition_type: 'llm',
          condition: 'fire when the headline suggests a regulatory problem',
          condition_payload_keys: ['headline', 'body'],
        }),
      ),
    ).toBe(false);
  });
});

describe('summariseBacktest', () => {
  it('separates would-fire, held and errored', () => {
    const s = summariseBacktest([
      verdict({ would_fire: true }),
      verdict({ would_fire: false }),
      verdict({ eval_error: 'missing field price' }),
    ]);
    expect(s.total).toBe(3);
    expect(s.wouldFire).toBe(1);
    expect(s.held).toBe(1);
    expect(s.errored).toBe(1);
  });

  it('groups errors by shape rather than listing them', () => {
    // Eight identical failures are one fact. Grouping is what makes the fix
    // obvious instead of a wall of identical rows.
    const s = summariseBacktest([
      verdict({ eval_error: 'missing field "price" at seq 12' }),
      verdict({ eval_error: 'missing field "price" at seq 44' }),
      verdict({ eval_error: 'missing field "price" at seq 91' }),
      verdict({ eval_error: 'timeout after 30s' }),
    ]);
    expect(s.errorGroups).toHaveLength(2);
    expect(s.errorGroups[0].count).toBe(3);
  });
});

describe('debounceFinding', () => {
  it('says nothing when there is too little to conclude from', () => {
    const s = summariseBacktest([verdict({ would_fire: true })]);
    expect(debounceFinding(s, config())).toBeNull();
  });

  it('recommends a first window when there is no debounce at all', () => {
    const s = summariseBacktest(Array.from({ length: 9 }, () => verdict({ would_fire: true })));
    const finding = debounceFinding(s, config({ debounce_seconds: 0 }));
    expect(finding?.suggestSeconds).toBe(60);
    expect(finding?.text).toMatch(/every signal starts its own plan/);
  });

  it('recommends widening an existing window', () => {
    const s = summariseBacktest(Array.from({ length: 9 }, () => verdict({ would_fire: true })));
    const finding = debounceFinding(s, config({ debounce_seconds: 60 }));
    expect(finding?.suggestSeconds).toBe(300);
  });
});

describe('emptyPipeline', () => {
  it('starts in dry run, never armed', () => {
    // A new pipeline must not be able to act before anyone has looked at it.
    const p = emptyPipeline();
    expect(p.dry_run).toBe(true);
    expect(p.active).toBe(false);
    expect(p.approved).toBe(false);
  });
});
