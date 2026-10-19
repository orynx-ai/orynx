import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn.ts';
import { SearchResult, SearchResultSkeleton } from './search-result.tsx';

export interface SuggestionOption {
  /** Unique on the page: the box points at the active one by it (`aria-activedescendant`). */
  id: string;
  /** What leads the row, for the eye: an icon. */
  mark: ReactNode;
  /** What's typed, in mono: `/review`. */
  code: string;
  /** One line, cut off with an ellipsis: what it does. Empty when it says nothing. */
  title: string;
  /** Quiet, at the end: where it's from. */
  meta?: string | undefined;
}

export type SuggestionListProps = Omit<ComponentProps<'div'>, 'children' | 'onSelect'> & {
  /** The listbox's id, for the box's `aria-controls`. */
  listId: string;
  /** Names the list for screen readers, and heads it: "Skills". */
  label: string;
  options: readonly SuggestionOption[];
  /** The option the box's arrow keys are on. */
  activeId: string | null;
  onPick: (id: string) => void;
  /** Three rows the size of real ones while the options are read. */
  loading?: boolean;
  /** One line in place of the options: none to offer, or they couldn't be read. */
  notice?: string | undefined;
};

/**
 * Not in the design system; spec 022 Q14 draws it as ⌘K's results in a popover, under a text box that keeps focus
 * while it's open: the box points at it with `aria-controls` and at the active row with `aria-activedescendant`
 * (a textarea can't take `aria-expanded`). A press picks a row without taking focus from the box.
 */
export function SuggestionList({
  listId,
  label,
  options,
  activeId,
  onPick,
  loading = false,
  notice,
  className,
  ...props
}: SuggestionListProps) {
  return (
    <div
      data-slot="suggestion-list"
      className={cn(
        'flex max-h-80 flex-col gap-1 overflow-y-auto rounded-md border border-border bg-raised p-1 shadow-overlay motion-safe:animate-menu-in',
        className,
      )}
      {...props}
    >
      <div aria-hidden className="px-2 pt-1.5 pb-1 text-small text-muted-foreground">
        {label}
      </div>
      {loading ? (
        <>
          <SearchResultSkeleton />
          <SearchResultSkeleton />
          <SearchResultSkeleton />
        </>
      ) : notice === undefined ? null : (
        <p className="m-0 px-3 py-2 text-small text-muted-foreground">{notice}</p>
      )}
      <div role="listbox" id={listId} aria-label={label} aria-busy={loading} className="flex flex-col gap-1">
        {loading
          ? null
          : options.map((option) => (
              <SearchResult
                key={option.id}
                id={option.id}
                active={option.id === activeId}
                mark={option.mark}
                code={option.code}
                title={option.title}
                meta={option.meta}
                // The box keeps focus, so typing goes on after a pick.
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  onPick(option.id);
                }}
              />
            ))}
      </div>
    </div>
  );
}
