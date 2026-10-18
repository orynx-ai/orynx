import { useId, type ComponentProps } from 'react';
import { cn } from '../lib/cn.ts';
import { Skeleton } from './skeleton.tsx';

export type TableProps = Omit<ComponentProps<'table'>, 'children'> & {
  /** What the table holds, for screen readers only, as the design draws it: "Tickets in Sprint 42". */
  caption: string;
  children: ComponentProps<'table'>['children'];
};

/**
 * A table, from shadcn's `table` restyled to the Tickets list (spec 008, Q10b): a hidden caption, a header
 * row on `bg-sidebar` in `text-label`, and a hairline between rows. A table wider than its box scrolls
 * sideways inside it; the box is a region named by the caption and in the Tab order, so the keyboard can
 * scroll it even when the table holds no links. `className` sizes the table, such as its least width.
 */
export function Table({ caption, className, children, ...props }: TableProps) {
  const captionId = useId();
  return (
    <div
      role="region"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling box must take focus to scroll by keyboard (axe: scrollable-region-focusable)
      tabIndex={0}
      aria-labelledby={captionId}
      data-slot="table-container"
      // Relative, so hidden text inside (a header read only by screen readers) is clipped here, not by the page.
      // The ring is drawn inside the box, so a panel around the table can't cut it off.
      className="relative w-full overflow-x-auto focus-visible:-outline-offset-2"
    >
      <table
        data-slot="table"
        className={cn('w-full border-collapse text-small text-muted-foreground', className)}
        {...props}
      >
        <caption id={captionId} className="sr-only">
          {caption}
        </caption>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('bg-sidebar', className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={cn('[&>tr]:border-t [&>tr]:border-border', className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr data-slot="table-row" className={className} {...props} />;
}

/** A column's heading. `scope="col"` unless told otherwise. */
export function TableHead({ className, scope = 'col', ...props }: ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      scope={scope}
      className={cn(
        'px-3 py-2.5 text-start align-middle text-label font-medium whitespace-nowrap first:ps-4 last:pe-4',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn('px-3 py-2.5 align-middle whitespace-nowrap first:ps-4 last:pe-4', className)}
      {...props}
    />
  );
}

/**
 * A row's loading form (spec 006 Q4a): one quiet bar a line tall in each cell, so the rows are as tall as
 * real ones and nothing moves when they arrive. Hidden from screen readers; mark the table `aria-busy`.
 */
export function TableRowSkeleton({ columns }: { columns: number }) {
  return (
    <tr aria-hidden data-slot="table-row-skeleton">
      {Array.from({ length: columns }, (_, index) => (
        <TableCell key={index}>
          <span className="flex h-6 items-center">
            <Skeleton className={cn('h-4', index === 1 ? 'w-full' : 'w-16')} />
          </span>
        </TableCell>
      ))}
    </tr>
  );
}
