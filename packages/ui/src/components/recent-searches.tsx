import { useId, useImperativeHandle, useRef, type ComponentProps, type KeyboardEvent, type Ref } from 'react';
import { Cancel01Icon, Clock01Icon } from '@hugeicons/core-free-icons';
import { cn } from '../lib/cn.ts';
import { Button } from './button.tsx';
import { Icon } from './icon.tsx';
import { IconButton } from './icon-button.tsx';

export interface RecentSearchesHandle {
  /** Moves focus to the first search, for the field's ↓. */
  focusFirst: () => void;
}

export type RecentSearchesProps = Omit<ComponentProps<'div'>, 'children' | 'ref'> & {
  /** Your last searches, newest first. With none, nothing is drawn. */
  items: readonly string[];
  onPick: (text: string) => void;
  onRemove: (text: string) => void;
  onClear: () => void;
  /** ↑ on the first search: give focus back to the field. */
  onLeave?: () => void;
  ref?: Ref<RecentSearchesHandle>;
};

/**
 * Your recent searches under a search field (spec 039): a "Recent searches" heading with Clear, then one row per
 * search, each with its remove button. A click never takes focus from the field, so the list stays open under it.
 * From the keyboard, the field's ↓ reaches the first search (`focusFirst`), ↓ and ↑ move between them, and ↑ on
 * the first goes back to the field (`onLeave`).
 */
export function RecentSearches({
  items,
  onPick,
  onRemove,
  onClear,
  onLeave,
  ref,
  className,
  ...props
}: RecentSearchesProps) {
  const headingId = useId();
  const list = useRef<HTMLUListElement>(null);
  const picks = () => [...(list.current?.querySelectorAll<HTMLButtonElement>('[data-recent-search]') ?? [])];
  useImperativeHandle(ref, () => ({ focusFirst: () => picks()[0]?.focus() }));
  if (items.length === 0) return null;

  function move(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const all = picks();
    const at = all.indexOf(event.currentTarget);
    if (event.key === 'ArrowUp' && at === 0) onLeave?.();
    else all[event.key === 'ArrowDown' ? Math.min(at + 1, all.length - 1) : at - 1]?.focus();
  }

  // A press that would move focus out of the field; the click still happens.
  const keepFocus = (event: { preventDefault: () => void }) => {
    event.preventDefault();
  };

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      data-slot="recent-searches"
      className={cn('flex flex-col gap-0.5', className)}
      {...props}
    >
      <div className="flex items-center gap-2 ps-2">
        <h3 id={headingId} className="m-0 text-small font-normal text-muted-foreground">
          Recent searches
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="ms-auto"
          aria-label="Clear recent searches"
          onMouseDown={keepFocus}
          onClick={onClear}
        >
          Clear
        </Button>
      </div>
      <ul ref={list} className="m-0 flex list-none flex-col gap-0.5 p-0">
        {items.map((text) => (
          <li key={text} className="flex items-center rounded-sm hover:bg-subtle">
            <button
              type="button"
              data-recent-search
              aria-label={`Search for ${text}`}
              className="flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm px-2 text-start text-small text-foreground"
              onMouseDown={keepFocus}
              onKeyDown={move}
              onClick={() => {
                onPick(text);
              }}
            >
              <Icon icon={Clock01Icon} aria-hidden className="size-4 text-muted-foreground" />
              <span className="truncate">{text}</span>
            </button>
            <IconButton
              variant="ghost"
              size="sm"
              label={`Remove “${text}” from recent searches`}
              onMouseDown={keepFocus}
              onClick={() => {
                onRemove(text);
              }}
            >
              <Icon icon={Cancel01Icon} aria-hidden className="size-4" />
            </IconButton>
          </li>
        ))}
      </ul>
    </div>
  );
}
