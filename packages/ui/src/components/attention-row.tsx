import type { ComponentProps, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Slot } from 'radix-ui';
import { cn } from '../lib/cn.ts';
import { buttonVariants } from './button.tsx';
import { Pill, type PillTone } from './pill.tsx';
import { Skeleton } from './skeleton.tsx';
import { SourceMark, type Source } from './source-mark.tsx';

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
  /** The one thing to do next: `<AttentionAction>`. */
  action?: ReactNode;
};

/**
 * Design system: AttentionRow (`dh-row`). One inbox item: where it comes from, what it is, why it
 * needs you, and the one thing to do next. At least 56 px tall; the title and sub line stay on one
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
};

/** The row's title: the link to the item, on one line, cut off with an ellipsis. */
export function AttentionTitle({ asChild = false, className, ...props }: AttentionTitleProps) {
  const Comp = asChild ? Slot.Root : 'a';
  return (
    <Comp
      data-slot="attention-title"
      className={cn('truncate font-medium text-foreground no-underline hover:underline', className)}
      {...props}
    />
  );
}

export type AttentionActionProps = Omit<ComponentProps<'a'>, 'children'> & {
  /** Render the child link (the router's) with the action's look and chevron. */
  asChild?: boolean;
  /** The action in a word: "Review", "Reply", "Open", "Fix", "Build". */
  children: ReactNode;
};

/**
 * The row's one action: a small ghost button with a chevron, at least 96 px wide and right-aligned,
 * as Home draws it (spec 006 Q3a). It goes somewhere, so it's a link.
 */
export function AttentionAction({ asChild = false, className, children, ...props }: AttentionActionProps) {
  const look = cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'min-w-24 shrink-0 justify-end', className);
  if (asChild) {
    return (
      <Slot.Root data-slot="attention-action" className={look} {...props}>
        <Slot.Slottable>{children}</Slot.Slottable>
        <ChevronRight aria-hidden />
      </Slot.Root>
    );
  }
  return (
    <a data-slot="attention-action" className={look} {...props}>
      {children}
      <ChevronRight aria-hidden />
    </a>
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
      <Skeleton className="h-8 w-24" />
    </li>
  );
}
