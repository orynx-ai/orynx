import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn.ts';
import { SearchGroup, SearchResult } from './search-result.tsx';
import { SearchField } from './search-field.tsx';

export interface SearchPaletteItem {
  /** Unique among all the groups. */
  id: string;
  /** For the eye only: a screen reader hears the code, title and meta. */
  mark: ReactNode;
  code?: string | undefined;
  codeEnd?: string | undefined;
  title: string;
  meta?: ReactNode;
}

export interface SearchPaletteGroup {
  id: string;
  /** "Tickets", or "Tickets · 6 of 23" when more match than it shows. */
  label: ReactNode;
  items: readonly SearchPaletteItem[];
}

export interface SearchPaletteProps {
  /** The search box's label and placeholder, and the results' name. */
  label: string;
  query: string;
  onQueryChange: (query: string) => void;
  /** The results to show, in order. Leave it empty to show `children` instead. */
  groups: readonly SearchPaletteGroup[];
  /** Enter, or a click, on a result. */
  onPick: (id: string) => void;
  /** What a screen reader hears once typing pauses, such as "25 results". */
  status?: string | undefined;
  /** One quiet line in a foot under the results, such as a tool still on its first sync. */
  note?: ReactNode;
  /** Marks the body as loading, while it shows loading rows. */
  busy?: boolean;
  /** What shows where results would be when there are none: a hint, loading rows, an empty state or an error. */
  children?: ReactNode;
  className?: string;
}

/** How long typing must pause before the count is read out, so a screen reader isn't talked over at each key. */
const statusPause = 500;

/**
 * ⌘K search's body (spec 009, Q3b to Q3d): a 40 px search box over a hairline, then the results in their
 * groups. The box is a combobox: ↓ and ↑ move the active result across groups and stop at the ends,
 * Enter picks it, and focus never leaves the box. Typing makes the first result active; when the results
 * change under it, the active one stays while it's there, and the first takes over when it goes. Put it in a `DialogContent`: the body scrolls
 * inside it while the box stays put.
 */
export function SearchPalette({
  label,
  query,
  onQueryChange,
  groups,
  onPick,
  status,
  note,
  busy = false,
  children,
  className,
}: SearchPaletteProps) {
  const baseId = useId();
  const listboxId = `${baseId}-results`;
  const domId = (id: string) => `${baseId}-${id}`;
  const items = groups.flatMap((group) => group.items);
  const [chosen, setChosen] = useState<string | null>(null);
  const activeId = items.some((item) => item.id === chosen) ? chosen : (items[0]?.id ?? null);
  // Remember the row that's really active, the first one included, so a result a sync puts ahead of it
  // doesn't take the highlight, and one that went and came back doesn't take it back (AC-26).
  if (activeId !== chosen) setChosen(activeId);
  const spoken = useSpokenAfterPause(status ?? '');

  const activeDomId = activeId === null ? undefined : domId(activeId);

  useEffect(() => {
    if (activeDomId !== undefined) document.getElementById(activeDomId)?.scrollIntoView({ block: 'nearest' });
  }, [activeDomId]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter that ends a Japanese or Chinese composition only confirms the text.
    if (event.nativeEvent.isComposing) return;
    const at = items.findIndex((item) => item.id === activeId);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = event.key === 'ArrowDown' ? Math.min(at + 1, items.length - 1) : Math.max(at - 1, 0);
      setChosen(items[next]?.id ?? null);
    } else if (event.key === 'Enter' && activeId !== null) {
      event.preventDefault();
      onPick(activeId);
    }
  }

  const open = items.length > 0;
  return (
    <div data-slot="search-palette" className={cn('relative flex min-h-0 flex-1 flex-col', className)}>
      <div className="border-b border-border p-3">
        <SearchField
          role="combobox"
          aria-label={label}
          placeholder={label}
          value={query}
          onChange={(event) => {
            setChosen(null);
            onQueryChange(event.target.value);
          }}
          onKeyDown={onKeyDown}
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-activedescendant={activeDomId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div
        aria-busy={busy || undefined}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling box must take focus to scroll by keyboard (axe: scrollable-region-focusable); the arrow keys in the search box still move the active result
        tabIndex={0}
        className="min-h-0 overflow-y-auto p-1.5"
      >
        {open ? (
          <div role="listbox" id={listboxId} aria-label={label} className="flex flex-col gap-1">
            {groups.map((group) => (
              <SearchGroup key={group.id} label={group.label}>
                {group.items.map((item) => (
                  <SearchResult
                    key={item.id}
                    id={domId(item.id)}
                    active={item.id === activeId}
                    mark={item.mark}
                    code={item.code}
                    codeEnd={item.codeEnd}
                    title={item.title}
                    meta={item.meta}
                    // Keep focus in the box; the click itself picks.
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onMouseMove={() => {
                      if (item.id !== activeId) setChosen(item.id);
                    }}
                    onClick={() => {
                      onPick(item.id);
                    }}
                  />
                ))}
              </SearchGroup>
            ))}
          </div>
        ) : (
          children
        )}
      </div>
      {/* A foot under the results, as Menu's is, so the line shows however far they scroll. */}
      {note ? <p className="border-t border-border px-3 py-2 text-small text-muted-foreground">{note}</p> : null}
      <div role="status" className="sr-only">
        {spoken}
      </div>
    </div>
  );
}

/** The text, once it has stayed the same for a moment. */
function useSpokenAfterPause(text: string): string {
  const [spoken, setSpoken] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSpoken(text);
    }, statusPause);
    return () => {
      clearTimeout(timer);
    };
  }, [text]);
  return spoken;
}
