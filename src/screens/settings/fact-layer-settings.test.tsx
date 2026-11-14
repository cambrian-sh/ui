import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FactLayerSettings } from './FactLayerSettings';
import type { ConfigSchema } from '@/ipc/types';

function schema(over: Partial<ConfigSchema> = {}): ConfigSchema {
  return {
    schema_version: '4',
    schema_json: JSON.stringify({
      properties: {
        'execution.ewma_alpha': { type: 'number', title: 'EWMA alpha' },
        'execution.facts.lane_enabled': {
          type: 'boolean',
          title: 'Fact lane in retrieval',
          'x-consequence': 'On: questions reach the source through its facts. Restart required.',
        },
        'execution.facts.max_facts_per_source': { type: 'number', title: 'Facts per source' },
      },
    }),
    schema_hash: 'h',
    editable_keys: [],
    kernel_only_keys: ['execution.facts.lane_enabled', 'execution.facts.max_facts_per_source'],
    current_values: { 'execution.facts.lane_enabled': 1, 'execution.facts.max_facts_per_source': 512 },
    value_source: { 'execution.facts.lane_enabled': 'default', 'execution.facts.max_facts_per_source': 'tuning.json' },
    ...over,
  } as ConfigSchema;
}

describe('FactLayerSettings (T-20261103-execution-facts-is-absent-from-the-operator)', () => {
  it('shows each fact-layer key with the running value and its source, read-only', () => {
    render(<FactLayerSettings schema={schema()} />);
    expect(screen.getByRole('region', { name: 'Fact layer' })).toBeInTheDocument();
    expect(screen.getByLabelText('Fact lane in retrieval value')).toHaveTextContent('On');
    expect(screen.getByLabelText('Facts per source value')).toHaveTextContent('512');
    expect(screen.getByText('tuning.json')).toBeInTheDocument();
    expect(screen.getByText(/Restart required/)).toBeInTheDocument();
    expect(screen.queryByText('EWMA alpha')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('renders nothing for a kernel whose schema has no fact keys', () => {
    const { container } = render(
      <FactLayerSettings schema={schema({ schema_json: JSON.stringify({ properties: {} }) })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
