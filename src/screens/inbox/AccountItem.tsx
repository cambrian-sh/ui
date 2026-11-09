import { Link } from '@tanstack/react-router';
import { KIND_LABEL, type InboxItem } from '@/lib/inbox';
import { MyAccountCard } from '@/screens/integrations/AccountsSection';

/**
 * An Inbox row for one of MY accounts (ADR-0141): a sign-in to confirm
 * (phishing defence — the card shows the identity and Confirm opens the
 * identity dialog) or an account to reconnect before my agents can continue.
 * It is the system page's own card, so the two cannot disagree.
 */
export function AccountItem({ item }: { item: InboxItem }) {
  const e = item.account!;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[11px] text-[var(--fg-muted)]">
        <span className="uppercase tracking-[0.08em]">{KIND_LABEL[item.kind]}</span>
        <span>· {item.title}</span>
        <Link to="/integrations" className="ml-auto underline underline-offset-4 hover:text-[var(--fg-primary)]">
          All systems
        </Link>
      </div>
      <MyAccountCard row={e.row} />
    </div>
  );
}
