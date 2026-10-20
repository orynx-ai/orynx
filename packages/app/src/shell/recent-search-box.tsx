import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { cn, RecentSearches, type RecentSearchesHandle } from '@devhub/ui';
import { useRecentSearches, type SearchPlace } from '../stores/recent-searches.ts';

/**
 * A search field with your recent searches under it (spec 039, Q3): while the field has focus and is empty, they drop
 * down over the page. Picking one runs it again; ↓ from the field reaches them, and Esc puts them away. Removing one
 * or clearing them keeps focus in the field.
 */
export function RecentSearchBox({
  place,
  query,
  onPick,
  fieldRef,
  className,
  children,
}: {
  place: SearchPlace;
  /** What's in the field now: the list shows only while it's empty. */
  query: string;
  onPick: (text: string) => void;
  /** The field, to give focus back to. */
  fieldRef: RefObject<HTMLInputElement | null>;
  className?: string;
  /** The field. */
  children: ReactNode;
}) {
  const items = useRecentSearches((state) => state.lists[place]);
  const remove = useRecentSearches((state) => state.remove);
  const clear = useRecentSearches((state) => state.clear);
  const recent = useRef<RecentSearchesHandle>(null);
  const [open, setOpen] = useState(false);
  const focusField = () => fieldRef.current?.focus();

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- it only hears the focus and keys of the field and the buttons inside it
    <div
      className={cn('relative', className)}
      onFocus={() => {
        setOpen(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open && query === '' && items.length > 0) {
          event.preventDefault();
          setOpen(false);
          focusField();
        } else if (event.key === 'ArrowDown' && event.target === fieldRef.current && query === '') {
          event.preventDefault();
          setOpen(true);
          recent.current?.focusFirst();
        }
      }}
    >
      {children}
      {open && query.trim() === '' ? (
        <RecentSearches
          ref={recent}
          floating
          items={items}
          onPick={onPick}
          onRemove={(text) => {
            remove(place, text);
            focusField();
          }}
          onClear={() => {
            clear(place);
            focusField();
          }}
          onLeave={focusField}
          // Over the page, under the field: as wide as it, and wide enough for a search on a phone.
          className="absolute start-0 top-full z-30 mt-1 w-full min-w-72"
        />
      ) : null}
    </div>
  );
}
