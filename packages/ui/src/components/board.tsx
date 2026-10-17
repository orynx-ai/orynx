import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../lib/cn.ts';
import { StatusIcon, type StatusIconStatus } from './status-icon.tsx';

export type BoardProps = ComponentProps<'div'> & {
  /** The region's name, for example "Board". */
  'aria-label': string;
};

/**
 * The Tickets board (spec 008, Q10a): its columns side by side, each at least 250 px wide, as the design
 * draws them. When the window is narrower, the board scrolls sideways inside its own box, never the page.
 * The box is a named region in the Tab order, so the arrow keys can scroll it.
 */
export function Board({ className, children, ...props }: BoardProps) {
  return (
    <div
      role="region"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling box must take focus to scroll by keyboard (axe: scrollable-region-focusable)
      tabIndex={0}
      data-slot="board"
      className={cn('overflow-x-auto pb-2', className)}
      {...props}
    >
      <div className="flex items-start gap-3">{children}</div>
    </div>
  );
}

export type BoardColumnProps = Omit<ComponentProps<'section'>, 'title'> & {
  /** The status icon's shape: to do, in progress, in review, done. */
  status: StatusIconStatus;
  /** The column's name: "In review". */
  title: string;
  /** How many tickets it holds. Left out while loading. */
  count?: number | undefined;
  /** At the end of the head, such as a button that adds a ticket here. */
  action?: ReactNode;
  /** The heading's level in the page's outline. */
  headingLevel?: 2 | 3;
  /** Loading: the column says so to screen readers. */
  busy?: boolean;
};

const headings = { 2: 'h2', 3: 'h3' } as const;

/**
 * Design system: board column (`dh-column`, `dh-column-head`). A `bg-sidebar` wash with the status icon,
 * the name, the count and an optional action on top, then its cards or its empty text. It's a region:
 * named by `aria-label` ("In review, 2 tickets") when given, by its heading otherwise.
 */
export function BoardColumn({
  status,
  title,
  count,
  action,
  headingLevel = 2,
  busy = false,
  className,
  children,
  ...props
}: BoardColumnProps) {
  const headingId = useId();
  const Heading = headings[headingLevel];
  return (
    <section
      data-slot="board-column"
      aria-labelledby={props['aria-label'] === undefined ? headingId : undefined}
      aria-busy={busy || undefined}
      className={cn('flex min-w-62.5 flex-1 basis-0 flex-col gap-2 rounded-md bg-sidebar p-1.5', className)}
      {...props}
    >
      <div className="flex h-8 items-center gap-2 px-1">
        <StatusIcon status={status} />
        <Heading id={headingId} className="m-0 text-small font-medium">
          {title}
        </Heading>
        {count === undefined ? null : <span className="text-label font-medium text-muted-foreground">{count}</span>}
        {action ? <span className="ms-auto inline-flex text-muted-foreground">{action}</span> : null}
      </div>
      {children}
    </section>
  );
}
