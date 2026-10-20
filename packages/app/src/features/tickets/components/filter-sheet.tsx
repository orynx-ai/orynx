import { useId, type ReactNode } from 'react';
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
  SheetTrigger,
} from '@devhub/ui';
import type { AddressFilters, FilterKey, FilterOptions } from '../filters.ts';
import { assigneeSearch, ticketCount } from '../ticket-words.ts';

/** The filters only the sheet holds; Source and Assignee also sit in the toolbar (spec 039). */
const sheetOnly: readonly FilterKey[] = ['status', 'type', 'priority', 'due'];

/** Past this many people, Assignee gets a search box (spec 039). */
const mostPeopleUnsearched = 8;

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
  /** The Project and Sprint pickers, at the top; left out where there's no sprint to pick (spec 037, Q7). */
  pickers?: ReactNode;
  /** Whether Source is offered: with Jira not connected, Orynx's are the only tickets there are. */
  sources: boolean;
  labels: Record<FilterKey, string>;
}

/**
 * Filters, and the sheet it opens from the right (spec 039): Project and Sprint, then every filter as checkboxes. Each
 * tick applies at once, so the board behind changes as you tick; the foot holds the count and Clear filters. The
 * button counts the filters only the sheet holds that are on.
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
  const on = sheetOnly.filter((key) => filters[key].length > 0).length;
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Picker variant="plain" icon={<Icon icon={FilterIcon} aria-hidden className="size-4" />} count={on}>
          Filters
        </Picker>
      </SheetTrigger>
      <SheetContent title="Filters">
        <SheetBody>
          {pickers === undefined ? null : (
            <div role="group" aria-label="Project and sprint" className="flex flex-col items-start gap-1">
              {pickers}
            </div>
          )}
          {(sources ? (['source', 'assignee', ...sheetOnly] as const) : (['assignee', ...sheetOnly] as const)).map(
            (key) => (
              <Checks
                key={key}
                legend={labels[key]}
                options={options[key]}
                ticked={filters[key]}
                searchable={key === 'assignee' && options[key].length > mostPeopleUnsearched}
                onTickedChange={(ticked) => {
                  onFiltersChange({ ...filters, [key]: ticked });
                }}
              />
            ),
          )}
        </SheetBody>
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

/** One filter's options as checkboxes in a fieldset named by its legend; Assignee's can be searched. */
function Checks({
  legend,
  options,
  ticked,
  searchable,
  onTickedChange,
}: {
  legend: string;
  options: FilterOptions['options'];
  ticked: readonly string[];
  searchable: boolean;
  onTickedChange: (ticked: string[]) => void;
}) {
  const form = useForm<{ text: string }>({ defaultValues: { text: '' } });
  const text = useWatch({ control: form.control, name: 'text' }).trim().toLowerCase();
  const shown = searchable ? options.filter((option) => option.label.toLowerCase().includes(text)) : options;
  const legendId = useId();
  return (
    <fieldset aria-labelledby={legendId} className="m-0 flex min-w-0 flex-col border-0 p-0">
      <legend id={legendId} className="mb-1 p-0 text-small font-medium">
        {legend}
      </legend>
      {searchable ? (
        <SearchField
          size="sm"
          aria-label={assigneeSearch.label}
          placeholder={assigneeSearch.label}
          className="my-1 w-full"
          {...form.register('text')}
        />
      ) : null}
      {shown.length === 0 ? (
        <p className="m-0 py-2 text-small text-muted-foreground">{assigneeSearch.empty}</p>
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
    </fieldset>
  );
}
