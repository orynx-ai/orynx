import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { FilterIcon } from '@hugeicons/core-free-icons';
import {
  Button,
  Checkbox,
  Icon,
  Picker,
  SearchField,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFoot,
  SheetRow,
  SheetTrigger,
} from '@devhub/ui';
import type { AddressFilters, FilterKey, FilterOptions } from '../filters.ts';
import { assigneeSearch, ticketCount } from '../ticket-words.ts';

/** The filters only the sheet holds; Source and Assignee also sit in the toolbar (spec 039). */
const sheetOnly: readonly FilterKey[] = ['status', 'type', 'priority', 'due'];

/** Past this many options, a filter's page has a search box over them, as Assignee's people need. */
const mostOptionsUnsearched = 6;

export interface FilterSheetProps {
  /** The filters in the address. */
  filters: AddressFilters;
  /** Each filter's options, from the sprint's own tickets (spec 020, AC-30). */
  options: Record<FilterKey, FilterOptions['options']>;
  onFiltersChange: (filters: AddressFilters) => void;
  /** Back to Assignee: Me alone, with the search emptied; focus stays in the sheet. */
  onClear: () => void;
  /** How many tickets the filters let through; left out while the sprint loads. */
  count: number | undefined;
  /** The Project and Sprint rows, first; left out where there's no sprint to pick (spec 037, Q7). */
  pickers?: ReactNode;
  /** Whether Source is offered: with Jira not connected, Orynx's are the only tickets there are. */
  sources: boolean;
  labels: Record<FilterKey, string>;
}

/**
 * Filters, and the sheet it opens from the right (spec 039), in the user's pattern (20 Oct 2026): a row for each
 * filter, with how many of its options are ticked and what they are ("Any" for none), that opens the filter's own page:
 * Back, its name, a search box when it has many options, and its checkboxes. Each tick applies at once, so the board
 * behind changes as you tick; the foot holds the count and Clear filters. The button counts every filter that's on.
 */
export function FilterSheet({
  filters,
  options,
  onFiltersChange,
  onClear,
  count,
  pickers,
  sources,
  labels,
}: FilterSheetProps) {
  const [page, setPage] = useState<FilterKey | null>(null);
  // The row a page was opened from, which takes focus again on Back.
  const openedFrom = useRef<FilterKey | null>(null);
  const keys: readonly FilterKey[] = sources ? ['source', 'assignee', ...sheetOnly] : ['assignee', ...sheetOnly];
  // Every filter that narrows the board, the toolbar's two included (the user's call, 20 Oct 2026): Source once only
  // one source is ticked, the others once anything is.
  const on = keys.filter((key) => (key === 'source' ? filters.source.length === 1 : filters[key].length > 0)).length;
  const summary = (key: FilterKey) =>
    filters[key].length === 0
      ? 'Any'
      : filters[key].map((value) => options[key].find((option) => option.value === value)?.label ?? value).join(', ');
  const focusOnReturn = useCallback((key: FilterKey, row: HTMLButtonElement | null) => {
    if (row === null || openedFrom.current !== key) return;
    openedFrom.current = null;
    row.focus();
  }, []);

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) setPage(null);
      }}
    >
      <SheetTrigger asChild>
        <Picker variant="plain" icon={<Icon icon={FilterIcon} aria-hidden className="size-4" />} count={on}>
          Filters
        </Picker>
      </SheetTrigger>
      <SheetContent
        title={page === null ? 'Filters' : labels[page]}
        back={
          page === null
            ? undefined
            : {
                label: 'Back to filters',
                onBack: () => {
                  openedFrom.current = page;
                  setPage(null);
                },
              }
        }
      >
        {page === null ? (
          <SheetBody className="gap-0 p-0">
            {pickers}
            {keys.map((key) => (
              <SheetRow
                key={key}
                ref={(row) => {
                  focusOnReturn(key, row);
                }}
                title={labels[key]}
                count={filters[key].length}
                summary={summary(key)}
                onClick={() => {
                  setPage(key);
                }}
              />
            ))}
          </SheetBody>
        ) : (
          <FilterPage
            key={page}
            label={labels[page]}
            options={options[page]}
            ticked={filters[page]}
            searchLabel={page === 'assignee' ? assigneeSearch.label : `Search ${labels[page]}`}
            emptyText={page === 'assignee' ? assigneeSearch.empty : 'Nothing matches'}
            onTickedChange={(ticked) => {
              onFiltersChange({ ...filters, [page]: ticked });
            }}
          />
        )}
        <SheetFoot>
          <span role="status" className="text-small text-muted-foreground">
            {count === undefined ? null : ticketCount(count)}
          </span>
          <Button variant="ghost" size="sm" className="ms-auto" onClick={onClear}>
            Clear filters
          </Button>
        </SheetFoot>
      </SheetContent>
    </Sheet>
  );
}

/**
 * One filter's page: a search box over many options, then its options as checkboxes, named by the filter. Focus
 * starts in the search box, or on the first option.
 */
function FilterPage({
  label,
  options,
  ticked,
  searchLabel,
  emptyText,
  onTickedChange,
}: {
  label: string;
  options: FilterOptions['options'];
  ticked: readonly string[];
  searchLabel: string;
  emptyText: string;
  onTickedChange: (ticked: string[]) => void;
}) {
  const form = useForm<{ text: string }>({ defaultValues: { text: '' } });
  const text = useWatch({ control: form.control, name: 'text' }).trim().toLowerCase();
  const searchable = options.length > mostOptionsUnsearched;
  const shown = searchable ? options.filter((option) => option.label.toLowerCase().includes(text)) : options;
  const focusFirst = useCallback((page: HTMLDivElement | null) => {
    page?.querySelector<HTMLElement>('input, button')?.focus();
  }, []);

  return (
    <SheetBody ref={focusFirst} className="gap-2">
      {searchable ? (
        <SearchField size="sm" aria-label={searchLabel} placeholder={searchLabel} {...form.register('text')} />
      ) : null}
      <div role="group" aria-label={label} className="flex flex-col">
        {shown.length === 0 ? (
          <p className="m-0 py-2 text-small text-muted-foreground">{emptyText}</p>
        ) : (
          shown.map((option) => (
            <Checkbox
              key={option.value}
              label={option.label}
              className="min-h-10 py-2"
              checked={ticked.includes(option.value)}
              onCheckedChange={(checked) => {
                onTickedChange(
                  checked === true ? [...ticked, option.value] : ticked.filter((value) => value !== option.value),
                );
              }}
            />
          ))
        )}
      </div>
    </SheetBody>
  );
}
