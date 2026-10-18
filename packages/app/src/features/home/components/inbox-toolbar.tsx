import { useCallback, useEffect, useRef, type ChangeEvent, type RefObject } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Menu, MenuCheckboxItem, MenuContent, MenuTrigger, Picker, SearchField } from '@devhub/ui';
import type { HomeTab } from '../inbox-tabs.ts';
import type { FilterKey, FilterMenu } from '../inbox-view.ts';
import { SearchFormSchema, type SearchFormValues } from '../schemas.ts';

const searchLabels: Record<HomeTab, string> = {
  all: 'Search',
  jira: 'Search tickets',
  'pull-requests': 'Search pull requests',
};

/**
 * Under a tab: the search box on the left and the tab's filters on the right (spec 007, Q9a, Q10b, Q10c).
 * Under 768 px the box takes a line of its own and the filters wrap under it.
 */
export function InboxToolbar({
  tab,
  query,
  menus,
  onQueryChange,
  onFilterChange,
  searchRef,
}: {
  tab: HomeTab;
  query: string;
  menus: FilterMenu[];
  onQueryChange: (query: string) => void;
  onFilterChange: (key: FilterKey, ticked: string[]) => void;
  /** The search box, for Clear search and filters to put focus back in it. */
  searchRef?: RefObject<HTMLInputElement | null>;
}) {
  const form = useForm<SearchFormValues>({ resolver: zodResolver(SearchFormSchema), defaultValues: { q: query } });
  const box = useRef<HTMLInputElement | null>(null);
  const { ref, ...field } = form.register('q', {
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      onQueryChange(event.target.value);
    },
  });
  // One ref for react-hook-form, the box's own and the caller's, kept across renders.
  const boxRef = useCallback(
    (element: HTMLInputElement | null) => {
      ref(element);
      box.current = element;
      if (searchRef) searchRef.current = element;
    },
    [ref, searchRef],
  );

  // The address can change without typing (Back, Clear search and filters). The box follows it, but never
  // while someone types in it: the address catches up a moment after each key.
  useEffect(() => {
    if (document.activeElement !== box.current && form.getValues('q') !== query) form.setValue('q', query);
  }, [query, form]);

  const label = searchLabels[tab];
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <form
        role="search"
        aria-label={label}
        className="w-full md:w-60"
        onSubmit={(event) => {
          // Results follow each key, so Enter has nothing left to do.
          event.preventDefault();
        }}
      >
        <SearchField aria-label={label} placeholder={label} className="w-full" ref={boxRef} {...field} />
      </form>
      <div className="flex flex-wrap items-center gap-2 md:ms-auto">
        {menus.map((menu) => (
          <FilterPicker
            key={menu.key}
            menu={menu}
            onTickedChange={(ticked) => {
              onFilterChange(menu.key, ticked);
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** One filter: a picker naming it, with how many are ticked, opening its options as checkboxes. */
function FilterPicker({ menu, onTickedChange }: { menu: FilterMenu; onTickedChange: (ticked: string[]) => void }) {
  const count = menu.ticked.length;
  return (
    <Menu>
      {/* Nothing to offer while the tab has no rows (Q11b). Radix reads `disabled` on the trigger. */}
      <MenuTrigger asChild disabled={menu.options.length === 0}>
        <Picker>{count === 0 ? menu.label : `${menu.label} · ${String(count)}`}</Picker>
      </MenuTrigger>
      <MenuContent aria-label={menu.label}>
        {menu.options.map((option) => (
          <MenuCheckboxItem
            key={option.value}
            checked={menu.ticked.includes(option.value)}
            onCheckedChange={(on) => {
              onTickedChange(
                on ? [...menu.ticked, option.value] : menu.ticked.filter((value) => value !== option.value),
              );
            }}
          >
            {option.label}
          </MenuCheckboxItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
