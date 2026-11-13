import * as React from "react";
import { cn } from "@/design-system/lib/utils";

export interface KeyValueItem {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Set machine values (ids, surfaces, counts) in mono. */
  mono?: boolean;
}

export interface KeyValueProps {
  items: KeyValueItem[];
  className?: string;
}

/** Facts about one thing, as aligned label/value rows. */
export function KeyValue({ items, className }: KeyValueProps) {
  return (
    <dl
      className={cn(
        "grid grid-cols-[minmax(7rem,max-content)_1fr] gap-x-6 gap-y-1.5 text-[var(--text-sm)]",
        className,
      )}
    >
      {items.map((item, i) => (
        <React.Fragment key={i}>
          <dt className="text-[var(--fg-muted)]">{item.label}</dt>
          <dd className={cn("min-w-0 text-[var(--fg-primary)]", item.mono && "font-mono text-[12.5px]")}>
            {item.value}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
