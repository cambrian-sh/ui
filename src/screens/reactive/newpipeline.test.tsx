import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NewPipelineDialog, starterGraph, slug } from './NewPipelineDialog';

/**
 * Creating a pipeline.
 *
 * The old flow opened a condition/action form — one condition, one arm, filled
 * in before anything was visible. It cannot express a branch or a discard, and
 * it asks for the expression before showing what the payload looks like.
 */
describe('starting a pipeline', () => {
  it('derives a stable id, because effect keys are built from it', () => {
    expect(slug('Quake watch → desk')).toBe('quake-watch-desk');
    expect(slug('  Trailing --- dashes  ')).toBe('trailing-dashes');
  });

  it('starts with a bound trigger and nothing after it', () => {
    const g = starterGraph('q', 'Quake watch', 'ingress', 'usgs-quakes');
    expect(g.trigger).toEqual({ type: 'ingress', ingress: 'usgs-quakes' });
    expect(g.scope.nodes).toHaveLength(1);
    // No edges: it does NOT compile, and that is the point — the refusal names
    // the next decision instead of the console inventing one.
    expect(g.scope.edges).toHaveLength(0);
  });

  it('binds the reference to the field its trigger kind uses', () => {
    expect(starterGraph('a', 'A', 'stream', 'ingress.records.*').trigger.stream_id).toBe(
      'ingress.records.*',
    );
    expect(starterGraph('b', 'B', 'schedule', '0 8 * * 1').trigger.cron).toBe('0 8 * * 1');
  });

  it('asks two questions and refuses to proceed without both', () => {
    render(<NewPipelineDialog onCancel={() => {}} onCreate={() => {}} />);
    expect(screen.getByText('Draw it')).toBeDisabled();

    fireEvent.change(screen.getByLabelText('What is it called?'), {
      target: { value: 'Quake watch' },
    });
    expect(screen.getByText('Draw it')).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Which ingress?'), {
      target: { value: 'usgs-quakes' },
    });
    expect(screen.getByText('Draw it')).toBeEnabled();
  });

  it('says up front that it will start refused, and why that is right', () => {
    render(<NewPipelineDialog onCancel={() => {}} onCreate={() => {}} />);
    expect(
      screen.getByText(/the trigger's output goes nowhere/),
    ).toBeInTheDocument();
    expect(screen.getByText(/better made on the canvas/)).toBeInTheDocument();
  });

  it('relabels the reference question for the trigger kind', () => {
    render(<NewPipelineDialog onCancel={() => {}} onCreate={() => {}} />);
    fireEvent.click(screen.getByText('A schedule'));
    expect(screen.getByLabelText('On what schedule?')).toBeInTheDocument();
  });

  it('hands back a graph, not a form', () => {
    let got: unknown = null;
    render(
      <NewPipelineDialog onCancel={() => {}} onCreate={(d) => { got = d; }} />,
    );
    fireEvent.change(screen.getByLabelText('What is it called?'), {
      target: { value: 'Quake watch' },
    });
    fireEvent.change(screen.getByLabelText('Which ingress?'), {
      target: { value: 'usgs-quakes' },
    });
    fireEvent.click(screen.getByText('Draw it'));
    expect(got).toMatchObject({
      id: 'quake-watch',
      name: 'Quake watch',
      scope: { nodes: [{ kind: 'trigger' }] },
    });
  });
});
