// The object page (ADR-0149 D7): one GetObject answer, rendered as it came.
//
// Nothing here decides access — the kernel omitted everything this reader may
// not see, so an absent section is absent, not hidden. Every value, link and
// timeline entry keeps its evidence id: the receipt is one click away.

import type { ObjectLink, ObjectPage, ObjectValue } from '@/ipc/types';

function shortTime(iso: string): string {
  return iso ? iso.replace('T', ' ').replace(/(\.\d+)?Z$/, 'Z') : '';
}

function Value({ value, onSelectEntity }: { value: ObjectValue; onSelectEntity: (id: string) => void }) {
  if (value.type === 'entity') {
    return (
      <button
        type="button"
        className="font-mono text-[12.5px] text-[var(--fg-link,var(--fg-primary))] underline-offset-2 hover:underline"
        onClick={() => onSelectEntity(value.display)}
      >
        {value.display}
      </button>
    );
  }
  return <span className="font-mono text-[12.5px] text-[var(--fg-primary)]">{value.display}</span>;
}

function Receipt({ id, onOpenReceipt }: { id: string; onOpenReceipt: (id: string) => void }) {
  if (!id) return null;
  return (
    <button
      type="button"
      className="text-[11.5px] text-[var(--fg-muted)] underline-offset-2 hover:underline"
      onClick={() => onOpenReceipt(id)}
      aria-label={`Open receipt ${id}`}
    >
      receipt
    </button>
  );
}

function LinkRow({
  link,
  onSelectEntity,
  onOpenReceipt,
}: {
  link: ObjectLink;
  onSelectEntity: (id: string) => void;
  onOpenReceipt: (id: string) => void;
}) {
  const other = link.other_ref.startsWith('entity:') ? link.other_ref.slice('entity:'.length) : '';
  return (
    <li className="flex items-baseline gap-2 text-[12.5px]">
      <span className="text-[var(--fg-muted)]">{link.direction === 'in' ? '←' : '→'}</span>
      <span className="text-[var(--fg-secondary,var(--fg-primary))]">{link.label}</span>
      {other ? (
        <Value value={{ type: 'entity', display: other }} onSelectEntity={onSelectEntity} />
      ) : (
        <span className="font-mono">{link.other_ref}</span>
      )}
      {link.other_kind && <span className="text-[11.5px] text-[var(--fg-muted)]">({link.other_kind})</span>}
      <Receipt id={link.evidence_id} onOpenReceipt={onOpenReceipt} />
    </li>
  );
}

export function ObjectCard({
  page,
  onOpenReceipt,
  onSelectEntity,
}: {
  page: ObjectPage;
  onOpenReceipt: (evidenceId: string) => void;
  onSelectEntity: (entityId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-mono text-[15px] font-semibold text-[var(--fg-primary)]">{page.entity_id}</h2>
        <p className="text-[12px] text-[var(--fg-muted)]">
          {page.kind} · declarations v{page.decl_version}
          {page.updated_at && ` · updated ${shortTime(page.updated_at)}`}
        </p>
      </div>

      {page.lifecycle && (
        <section aria-label="Lifecycle" className="flex flex-col gap-1">
          <h3 className="type-section-title text-[var(--fg-primary)]">Lifecycle</h3>
          <p className="text-[12.5px] text-[var(--fg-primary)]">
            {page.lifecycle.state ? (
              <>
                State <span className="font-mono">{page.lifecycle.state}</span>
              </>
            ) : (
              'No state yet'
            )}
            {page.lifecycle.allowed.length > 0
              ? ` · may move to ${page.lifecycle.allowed.join(', ')}`
              : page.lifecycle.state && ' · terminal'}
          </p>
        </section>
      )}

      <section aria-label="Properties" className="flex flex-col gap-2">
        <h3 className="type-section-title text-[var(--fg-primary)]">Properties</h3>
        {page.properties.length === 0 ? (
          <p className="text-[12.5px] text-[var(--fg-muted)]">No property values you may read.</p>
        ) : (
          <table className="w-full text-left text-[12.5px]" aria-label="Properties">
            <thead className="text-[11.5px] text-[var(--fg-muted)]">
              <tr>
                <th className="py-1 pr-3 font-normal">Property</th>
                <th className="py-1 pr-3 font-normal">Value</th>
                <th className="py-1 pr-3 font-normal">As of</th>
                <th className="py-1 pr-3 font-normal">Source</th>
                <th className="py-1 font-normal">
                  <span className="sr-only">Receipt</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {page.properties.map((p) => (
                <tr key={p.property} className="align-top">
                  <td className="py-1 pr-3 font-mono text-[var(--fg-muted)]">{p.property}</td>
                  <td className="py-1 pr-3">
                    <Value value={p.value} onSelectEntity={onSelectEntity} />
                    {p.conflict && (
                      <ul aria-label={`Other values of ${p.property}`} className="mt-1 text-[11.5px] text-[var(--fg-muted)]">
                        {p.alternatives.map((a) => (
                          <li key={`${a.source}-${a.at}`}>
                            conflict: {a.source} says <span className="font-mono">{a.value.display}</span>{' '}
                            ({shortTime(a.at)}) <Receipt id={a.evidence_id} onOpenReceipt={onOpenReceipt} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="py-1 pr-3 text-[var(--fg-muted)]">{shortTime(p.at)}</td>
                  <td className="py-1 pr-3 text-[var(--fg-muted)]">{p.source}</td>
                  <td className="py-1">
                    <Receipt id={p.evidence_id} onOpenReceipt={onOpenReceipt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {(page.extra_properties?.length ?? 0) > 0 && (
        <section aria-label="Undeclared properties" className="flex flex-col gap-2">
          <h3 className="type-section-title text-[var(--fg-primary)]">Undeclared properties</h3>
          <p className="text-[11.5px] text-[var(--fg-muted)]">
            Values the source sent that this kind does not declare. Read-only, and not usable as
            filters until the property is declared.
          </p>
          <table className="w-full text-left text-[12.5px]" aria-label="Undeclared properties">
            <tbody>
              {page.extra_properties!.map((p) => (
                <tr key={p.property} className="align-top">
                  <td className="py-1 pr-3 font-mono text-[var(--fg-muted)]">{p.property}</td>
                  <td className="py-1 pr-3">
                    <Value value={p.value} onSelectEntity={onSelectEntity} />
                  </td>
                  <td className="py-1 pr-3 text-[var(--fg-muted)]">{shortTime(p.at)}</td>
                  <td className="py-1 pr-3 text-[var(--fg-muted)]">{p.source}</td>
                  <td className="py-1">
                    <Receipt id={p.evidence_id} onOpenReceipt={onOpenReceipt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {page.aliases.length > 0 && (
        <section aria-label="Aliases" className="flex flex-col gap-2">
          <h3 className="type-section-title text-[var(--fg-primary)]">Aliases</h3>
          <ul className="flex flex-col gap-1">
            {page.aliases.map((l) => (
              <LinkRow key={l.link_id} link={l} onSelectEntity={onSelectEntity} onOpenReceipt={onOpenReceipt} />
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Links" className="flex flex-col gap-2">
        <h3 className="type-section-title text-[var(--fg-primary)]">Links</h3>
        {page.links.length === 0 ? (
          <p className="text-[12.5px] text-[var(--fg-muted)]">No confirmed links you may read.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {page.links.map((l) => (
              <LinkRow key={l.link_id} link={l} onSelectEntity={onSelectEntity} onOpenReceipt={onOpenReceipt} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Timeline" className="flex flex-col gap-2">
        <h3 className="type-section-title text-[var(--fg-primary)]">Recent timeline</h3>
        {page.timeline.length === 0 ? (
          <p className="text-[12.5px] text-[var(--fg-muted)]">Nothing recorded you may read.</p>
        ) : (
          <ol className="flex flex-col gap-1 text-[12.5px]">
            {page.timeline.map((e, i) => (
              <li key={`${e.kind}-${e.event_id || e.property}-${i}`} className="flex items-baseline gap-2">
                <span className="w-[170px] flex-none text-[var(--fg-muted)]">{shortTime(e.at)}</span>
                {e.kind === 'event' ? (
                  <span>
                    event <span className="font-mono">{e.event_type}</span>
                  </span>
                ) : (
                  <span>
                    <span className="font-mono text-[var(--fg-muted)]">{e.property}</span> ={' '}
                    <span className="font-mono">{e.value.display}</span>
                  </span>
                )}
                <Receipt id={e.evidence_id} onOpenReceipt={onOpenReceipt} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
