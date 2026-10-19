import type { ComponentProps, ReactNode } from 'react';
import { ArrowUpRight01Icon } from '@hugeicons/core-free-icons';
import { Slot } from 'radix-ui';
import { cn } from '../lib/cn.ts';
import { Pill, type PillTone } from './pill.tsx';
import { Skeleton } from './skeleton.tsx';
import { SourceMark, type Source } from './source-mark.tsx';
import { Icon } from './icon.tsx';

/** The inbox list: rows split by a hairline. Inside a `Panel`, rows run to its edges. */
export function AttentionList({ className, ...props }: ComponentProps<'ul'>) {
  return (
    <ul data-slot="attention-list" className={cn('m-0 list-none divide-y divide-border p-0', className)} {...props} />
  );
}

/**
 * Each row is its own size container: when it's under 480 px wide, the reason pill moves onto a line
 * of its own under the sub line, lined up with the title, and the action stays at the end (spec
 * 006 Q4b). It follows the row's width, not the window's, so it works in any panel.
 */
const rowClass = '@container flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5';
const reasonClass = '@max-[30rem]:order-last @max-[30rem]:basis-full @max-[30rem]:ps-8';

export type AttentionRowProps = Omit<ComponentProps<'li'>, 'title'> & {
  /** Where it comes from. The mark is for the eye; a screen reader hears the source's name. */
  source: Source;
  /** What it is: `<AttentionTitle>`, the link to the item. */
  title: ReactNode;
  /** One line more: "web-app #2841 · by Priya S.". */
  sub?: ReactNode;
  /** Why it needs you, always with the wait: "No reply · 3 h". */
  reason: ReactNode;
  reasonTone?: PillTone | undefined;
  /** What you can do from here: `<AttentionActions>` around icon buttons (spec 020). */
  action?: ReactNode;
};

/**
 * Design system: AttentionRow (`dh-row`). One inbox item: where it comes from, what it is, why it
 * needs you, and what you can do from here. At least 56 px tall; the title and sub line stay on one
 * line each, cut off with an ellipsis. `bg-subtle` on hover.
 */
export function AttentionRow({
  source,
  title,
  sub,
  reason,
  reasonTone = 'warning',
  action,
  className,
  ...props
}: AttentionRowProps) {
  return (
    <li data-slot="attention-row" className={cn(rowClass, 'hover:bg-subtle', className)} {...props}>
      <SourceMark source={source} label="hidden" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title}
        {sub ? <span className="truncate text-small text-muted-foreground">{sub}</span> : null}
      </div>
      <span className={cn('flex', reasonClass)}>
        <Pill tone={reasonTone}>{reason}</Pill>
      </span>
      {action}
    </li>
  );
}

export type AttentionTitleProps = ComponentProps<'a'> & {
  /** Render the child link (the router's) with the title's look. */
  asChild?: boolean;
  /**
   * It opens outside Orynx, in Jira or GitHub: the arrow after it, and on hover the `bg-subtle` highlight with
   * the underline, as every external link (the user's call, 18 Oct 2026).
   */
  external?: boolean;
};

/** The row's title: the link to the item, on one line, cut off with an ellipsis. */
export function AttentionTitle({
  asChild = false,
  external = false,
  className,
  children,
  ...props
}: AttentionTitleProps) {
  if (external) {
    return (
      <a
        data-slot="attention-title"
        className={cn(
          // As wide as its text, and never wider than the row, so a long title is cut off before its arrow.
          'inline-flex w-fit max-w-full min-w-0 items-center gap-1 rounded-xs font-medium text-foreground no-underline hover:bg-subtle hover:underline',
          className,
        )}
        {...props}
      >
        {/* Only the text is cut off; the arrow stays. */}
        <span className="truncate">{children}</span>
        <Icon icon={ArrowUpRight01Icon} aria-hidden className="size-3.5" />
      </a>
    );
  }
  const Comp = asChild ? Slot.Root : 'a';
  return (
    <Comp
      data-slot="attention-title"
      className={cn('truncate font-medium text-foreground no-underline hover:underline', className)}
      {...props}
    >
      {children}
    </Comp>
  );
}

export type AttentionTitleButtonProps = Omit<ComponentProps<'button'>, 'type'>;

/**
 * The row's title as a button, for a title that opens something in the page rather than going somewhere: the
 * ticket dialog (spec 022, Q8). It looks as the title link does, on one line cut off with an ellipsis, and has no
 * arrow, since it stays inside Orynx.
 */
export function AttentionTitleButton({ className, children, ...props }: AttentionTitleButtonProps) {
  return (
    <button
      type="button"
      data-slot="attention-title"
      className={cn(
        'w-fit max-w-full min-w-0 cursor-pointer truncate rounded-xs border-0 bg-transparent p-0 text-start font-medium text-foreground hover:underline',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export type AttentionActionsProps = ComponentProps<'div'>;

/**
 * The row's actions at its end: icon buttons (`IconButton`), each with its words in a tooltip. Since spec 022 a
 * row has one, such as Add to composer or Open session, so it's always as wide as one and the reason pills line
 * up down the list.
 */
export function AttentionActions({ className, ...props }: AttentionActionsProps) {
  return (
    <div
      data-slot="attention-actions"
      className={cn('flex min-w-8 shrink-0 items-center justify-end gap-1', className)}
      {...props}
    />
  );
}

/**
 * A row's loading form (spec 006 Q4a): the same padding, lines and wrap as a row with a sub line,
 * so nothing moves when the items arrive. Hidden from screen readers; mark the list `aria-busy`.
 */
export function AttentionRowSkeleton({ className, ...props }: Omit<ComponentProps<'li'>, 'children'>) {
  return (
    <li data-slot="attention-row-skeleton" aria-hidden className={cn(rowClass, className)} {...props}>
      <Skeleton className="size-5" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex h-6 items-center">
          <Skeleton className="h-4 w-3/4" />
        </span>
        <span className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-1/2" />
        </span>
      </div>
      <span className={cn('flex', reasonClass)}>
        <Skeleton className="h-6 w-28" />
      </span>
      <Skeleton className="size-8" />
    </li>
  );
}
