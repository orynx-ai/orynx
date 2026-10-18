import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../lib/cn.ts';
import { Skeleton } from './skeleton.tsx';

export type SearchGroupProps = ComponentProps<'div'> & {
  /** The group's name, which also names it for screen readers: "Tickets", or "Tickets · 6 of 23". */
  label: ReactNode;
};

/** One kind of result in a search listbox, under a quiet label like the Menu's (spec 009, Q3c). */
export function SearchGroup({ label, className, children, ...props }: SearchGroupProps) {
  const labelId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      data-slot="search-group"
      className={cn('flex flex-col', className)}
      {...props}
    >
      <div id={labelId} role="presentation" className="px-2 pt-1.5 pb-1 text-small text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

/**
 * A 40 px row, as Menu's items are. Under 480 px of its own width the meta leaves the eye, so the key and
 * title keep their room; a screen reader still hears it.
 */
const rowClass =
  'relative @container flex min-h-10 cursor-pointer items-center gap-3 rounded-sm px-2 py-1.5 text-foreground select-none';

export type SearchResultProps = Omit<ComponentProps<'div'>, 'title' | 'children'> & {
  /** Unique on the page: the search box points at the active result by it. */
  id: string;
  /** The result the arrow keys are on: `bg-subtle`, and selected for screen readers. */
  active?: boolean;
  /** What leads the row: a `SourceMark` with `label="none"`, or a session's `SessionStateIcon`. */
  mark: ReactNode;
  /** The key or "web-app #2841", in mono. */
  code?: ReactNode;
  /** One line, cut off with an ellipsis; the tooltip shows it whole. */
  title: string;
  /** The status, author or state, quiet, at the end. */
  meta?: ReactNode;
};

/**
 * One search result (spec 009, Q3c): an option in a listbox, drawn like Menu's 40 px items. It's named by
 * its own words, with a pause between them for screen readers: "PROJ-1423, Add bulk archive, In Progress".
 */
export function SearchResult({ id, active = false, mark, code, title, meta, className, ...props }: SearchResultProps) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      data-slot="search-result"
      className={cn(rowClass, active && 'bg-subtle', className)}
      {...props}
    >
      <span aria-hidden className="flex size-6 shrink-0 items-center justify-center">
        {mark}
      </span>
      {/* The spaces and hidden commas give screen readers "PROJ-1423, Add bulk archive, In Progress"; flex drops them visually. */}
      {code ? (
        <>
          <span className="shrink-0 font-mono text-code text-muted-foreground">
            {code}
            <span className="sr-only">,</span>
          </span>{' '}
        </>
      ) : null}
      {/* relative: the hidden comma is placed in the title's box, which cuts it off with the title; placed in
          the row's, it would sit past the whole title and widen the scrolling results (spec 008, task 21). */}
      <span className="relative min-w-0 flex-1 truncate" title={title}>
        {title}
        {meta ? <span className="sr-only">,</span> : null}
      </span>
      {meta ? (
        <>
          {' '}
          <span className="shrink-0 text-small text-muted-foreground @max-[30rem]:sr-only">{meta}</span>
        </>
      ) : null}
    </div>
  );
}

/** Holds a result's place while the list loads: the same 40 px row, for the eye only. */
export function SearchResultSkeleton({ className, ...props }: Omit<ComponentProps<'div'>, 'children'>) {
  return (
    <div aria-hidden className={cn(rowClass, 'cursor-default', className)} {...props}>
      <Skeleton shape="circle" className="size-6" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 flex-1" />
    </div>
  );
}
