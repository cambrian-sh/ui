import { Link } from '@tanstack/react-router';
import { KIND_LABEL, type InboxItem } from '@/lib/inbox';

/**
 * An Inbox row for an ingress PAUSED because its account is unusable
 * (ADR-0141 D3; AccountsAdmin.ListMyAttention). Nothing to approve: the fix is
 * the account (reconnect / confirm / bind another), and the ingress resumes by
 * itself once the account works, which also removes this row.
 */
export function AttentionItem({ item }: { item: InboxItem }) {
  const a = item.attention!;
  const personal = a.owner !== '';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[11px] text-[var(--fg-muted)]">
        <span className="uppercase tracking-[0.08em]">{KIND_LABEL[item.kind]}</span>
        <span>· {a.consumer_name || a.consumer_id}</span>
      </div>
      <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] border-l-[3px] border-l-[var(--status-warn)] p-3">
        <h2 className="text-[15px] font-medium">{item.title}</h2>
        <p className="mt-1 text-[12px] text-[var(--fg-muted)]">
          {a.reason.replace(/^account_/, '').replace(/_/g, ' ')}
          {a.account ? ` · ${a.account}` : ''}
          {a.slot ? ` · credential ${a.slot}` : ''}
        </p>
        {a.detail && <p className="mt-1 break-words font-mono text-[11px] text-[var(--fg-muted)]">{a.detail}</p>}
        <div className="mt-2 flex gap-3 text-[12px]">
          <Link to="/integrations" className="underline underline-offset-4 hover:text-[var(--fg-primary)]">
            {personal ? 'Reconnect the account' : 'Manage accounts'}
          </Link>
          <span className="text-[var(--fg-muted)]">The ingress resumes by itself once the account works.</span>
        </div>
      </div>
    </div>
  );
}
