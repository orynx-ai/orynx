import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { Collapsible } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn.ts';
import { Icon } from './icon.tsx';
import { StatusDot, type StatusDotTone } from './status-dot.tsx';

export type HistoryListProps = Omit<ComponentProps<'ul'>, 'aria-label'> & {
  /** What the list is, for screen readers: "Sync history". */
  'aria-label': string;
};

/** Design: Sync activity's history (spec 035 Q4). A list of {@link HistoryRow}s, each with a hairline above it. */
export function HistoryList({ className, ...props }: HistoryListProps) {
  return <ul className={cn('m-0 flex list-none flex-col p-0', className)} {...props} />;
}

export type HistoryRowProps = Omit<ComponentProps<typeof Collapsible.Root>, 'asChild'> & {
  tone: StatusDotTone;
  /** When it happened: "09:57". */
  time: string;
  /** A name in bold before the summary, such as the tool's in a list of every tool's runs: "Jira". */
  lead?: string;
  /** What happened, cut to one line: "3 new · 1 updated". */
  summary: string;
  /** `muted` for nothing to report ("No changes"), `danger` for a failure. */
  summaryTone?: 'default' | 'muted' | 'danger';
  /** How long it took: "1.2s". */
  duration: string;
  /** The result in words, for screen readers, since the dot only shows it: "failed". */
  status: string;
  /** What opens below the row. */
  children: ReactNode;
};

/**
 * Design: Sync activity's history row (spec 035 Q4). One button across the row (a dot, the time, the summary,
 * the duration and a chevron) that opens what's under it in place, from Radix Collapsible: `aria-expanded` and
 * `aria-controls` come with it, and Enter or Space open it as a click does.
 */
export function HistoryRow({
  tone,
  time,
  lead,
  summary,
  summaryTone = 'default',
  duration,
  status,
  children,
  className,
  ...props
}: HistoryRowProps) {
  // One name for the whole row: a screen reader would run the separate parts together.
  const name = `${[time, lead, summary, duration].filter((part) => part !== undefined).join(' ')}, ${status}`;
  return (
    <Collapsible.Root asChild {...props}>
      <li className={cn('border-t border-border', className)}>
        <Collapsible.Trigger
          aria-label={name}
          className="group flex w-full cursor-pointer items-center gap-2.5 rounded-sm border-0 bg-transparent px-1 py-2.5 text-start text-small text-foreground"
        >
          <span className="flex w-4.5 shrink-0 justify-center">
            <StatusDot tone={tone} />
          </span>
          <span className="min-w-12 shrink-0 font-mono text-label whitespace-nowrap text-muted-foreground">{time}</span>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {lead === undefined ? null : <span className="shrink-0 font-medium">{lead}</span>}
            <span
              className={cn(
                'truncate',
                summaryTone === 'muted' && 'text-muted-foreground',
                summaryTone === 'danger' && 'text-danger',
              )}
            >
              {summary}
            </span>
          </span>
          <span className="shrink-0 font-mono text-label text-muted-foreground">{duration}</span>
          <Icon
            icon={ArrowRight01Icon}
            className="size-4 shrink-0 text-muted-foreground group-data-[state=open]:rotate-90 motion-safe:transition-transform"
          />
        </Collapsible.Trigger>
        <Collapsible.Content className="flex flex-col gap-1.5 ps-21.5 pe-1 pb-3 text-small max-md:ps-1">
          {children}
        </Collapsible.Content>
      </li>
    </Collapsible.Root>
  );
}
