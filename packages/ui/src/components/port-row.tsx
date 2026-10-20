import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn.ts';
import { Skeleton } from './skeleton.tsx';
import { StatusDot } from './status-dot.tsx';

export type PortListProps = Omit<ComponentProps<'ul'>, 'aria-label'> & {
  /** What the list is, for screen readers: "Ports". */
  'aria-label': string;
};

/** Design: none — the Ports tab (spec 042, Q10). A list of {@link PortRow}s, a hairline between them. */
export function PortList({ className, ...props }: PortListProps) {
  return <ul className={cn('m-0 flex list-none flex-col divide-y divide-border p-0', className)} {...props} />;
}

/** One height for a row and its skeleton, so nothing moves when the ports arrive. */
const rowClass = 'flex min-h-14 items-center gap-3 py-2';

export type PortRowProps = Omit<ComponentProps<'li'>, 'children'> & {
  /** Where it listens: "localhost:3005". */
  address: string;
  /** What it is: a known name ("PostgreSQL") or its program ("node"). */
  name: string;
  /** Its command line, cut to one line; the whole of it shows on hover. */
  command: string;
  /** Who started it and for how long: "Claude · 4 min". */
  meta: string;
  /** Its buttons: Open or Copy address, Restart, Stop. */
  actions?: ReactNode;
};

/**
 * Design: none — a port that listens from a session (spec 042, Q10), as the Changes tab's file rows are drawn: a
 * green dot, the address and what it is, its command and who started it under them, and its buttons at the end.
 */
export function PortRow({ address, name, command, meta, actions, className, ...props }: PortRowProps) {
  return (
    <li className={cn(rowClass, className)} {...props}>
      <StatusDot tone="success" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2 text-body">
          <span className="font-mono font-medium text-foreground">{address}</span>
          <span className="truncate text-muted-foreground">{name}</span>
        </span>
        <span className="flex min-w-0 items-baseline gap-2 text-small text-muted-foreground">
          <span className="min-w-0 truncate font-mono text-code" title={command}>
            {command}
          </span>
          <span className="shrink-0 whitespace-nowrap">{meta}</span>
        </span>
      </div>
      {actions === undefined ? null : <span className="flex shrink-0 items-center gap-1">{actions}</span>}
    </li>
  );
}

/** A row still loading, the height of a real one. */
export function PortRowSkeleton({ className, ...props }: Omit<ComponentProps<'li'>, 'children'>) {
  return (
    <li data-slot="port-row-skeleton" aria-hidden className={cn(rowClass, className)} {...props}>
      <Skeleton shape="circle" className="size-2" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex h-6 items-center">
          <Skeleton className="h-4 w-40" />
        </span>
        <span className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-3/4" />
        </span>
      </div>
      <Skeleton className="size-8" />
    </li>
  );
}
