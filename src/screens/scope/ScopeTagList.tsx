interface ScopeTagListProps {
  tags: string[];
  label: string;
}

export function ScopeTagList({ tags, label }: ScopeTagListProps) {
  return (
    <div>
      <dt className="text-[var(--fg-muted)]">{label}</dt>
      <dd className="text-[var(--fg-secondary)]">
        {tags.length > 0 ? tags.join(', ') : '—'}
      </dd>
    </div>
  );
}
