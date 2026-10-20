import type { ReactNode, Ref } from 'react';
import { Button, FilterMenu } from '@devhub/ui';
import { Toolbar } from '../../../shell/page-frame.tsx';
import {
  filterKeys,
  hasExtraFilters,
  type AddressFilters,
  type FilterKey,
  type FilterOptions,
  type TicketFilters,
} from '../filters.ts';
import { assigneeSearch, ticketCount } from '../ticket-words.ts';
import { FilterSheet } from './filter-sheet.tsx';

export interface TicketsToolbarProps {
  filters: TicketFilters;
  onFiltersChange: (filters: AddressFilters) => void;
  /** Each filter's options, from the sprint's own tickets (spec 020, AC-30). */
  options: Record<FilterKey, FilterOptions['options']>;
  /** Back to Assignee: Me alone, with the search emptied (AC-33). */
  onClear: () => void;
  /** The same from inside the filter sheet, where focus stays (spec 039, AC-6). */
  onReset: () => void;
  /** How many tickets the filters let through; left out while the sprint loads. */
  count: number | undefined;
  /** Assignee, where Clear filters puts focus (AC-33). */
  assigneeRef?: Ref<HTMLButtonElement>;
  /** The search field, first: on its own line under 768 px (Q8g), beside the filters from there (spec 039). */
  search?: ReactNode;
  /** The Project and Sprint pickers, at the top of the filter sheet (spec 020; the page bar has them too, spec 039). */
  pickers?: ReactNode;
  /** Whether Source is offered: with Jira not connected, Orynx's are the only tickets there are (spec 037, Q7). */
  sources?: boolean;
}

const filterLabels: Record<FilterKey, string> = {
  source: 'Source',
  assignee: 'Assignee',
  status: 'Status',
  type: 'Type',
  priority: 'Priority',
  due: 'Due',
};

/**
 * Tickets' filters (spec 020, replacing spec 008's three chips) and the live count: Source and Assignee, then Filters,
 * which opens every filter in a sheet (spec 039). The count is a polite status, so a screen reader hears the new count
 * when a filter or the search changes it (AC-31).
 */
export function TicketsToolbar({
  filters,
  onFiltersChange,
  options,
  onClear,
  onReset,
  count,
  assigneeRef,
  search,
  pickers,
  sources = true,
}: TicketsToolbarProps) {
  const { text: _, ...address } = filters;
  return (
    <Toolbar role="group" aria-label="Filters">
      {/* First, at every width since spec 039, so the page bar has room for Project and Sprint. */}
      {search === undefined ? null : <div className="w-full md:w-60">{search}</div>}
      {filterKeys
        // Source and Assignee stay in the toolbar; the rest wait in the sheet (spec 039).
        .filter((key) => (sources && key === 'source') || key === 'assignee')
        .map((key) => (
          <FilterMenu
            key={key}
            {...(key === 'assignee' && assigneeRef !== undefined ? { ref: assigneeRef } : {})}
            label={filterLabels[key]}
            options={options[key]}
            ticked={address[key]}
            onTickedChange={(ticked) => {
              onFiltersChange({ ...address, [key]: ticked });
            }}
            // Compact, at most 360 px tall, as the pickers beside them (spec 020, AC-40).
            size="sm"
            // People can be many, so Assignee searches them (the user's call, 19 Oct 2026).
            {...(key === 'assignee' ? { searchLabel: assigneeSearch.label, emptyText: assigneeSearch.empty } : {})}
          />
        ))}
      <FilterSheet
        filters={address}
        options={options}
        onFiltersChange={onFiltersChange}
        onClear={onReset}
        count={count}
        pickers={pickers}
        sources={sources}
        labels={filterLabels}
      />
      {/* As wide and tall as its count from the first paint, so the row it lands on never changes as the count comes. */}
      <span className="ms-auto flex min-h-8 min-w-20 items-center justify-end gap-2">
        {hasExtraFilters(filters) ? (
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        ) : null}
        <span role="status" className="text-small text-muted-foreground">
          {count === undefined ? null : ticketCount(count)}
        </span>
      </span>
    </Toolbar>
  );
}
