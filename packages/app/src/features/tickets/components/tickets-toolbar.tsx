import type { ReactNode, Ref } from 'react';
import { FilterIcon } from '@hugeicons/core-free-icons';
import { Button, FilterMenu, Icon } from '@devhub/ui';
import { Toolbar } from '../../../shell/page-frame.tsx';
import {
  filterKeys,
  hasExtraFilters,
  type AddressFilters,
  type FilterKey,
  type FilterOptions,
  type TicketFilters,
} from '../filters.ts';
import { ticketCount } from '../ticket-words.ts';

export interface TicketsToolbarProps {
  filters: TicketFilters;
  onFiltersChange: (filters: AddressFilters) => void;
  /** Each filter's options, from the sprint's own tickets (spec 020, AC-30). */
  options: Record<FilterKey, FilterOptions['options']>;
  /** Back to Assignee: Me alone, with the search emptied (AC-33). */
  onClear: () => void;
  /** How many tickets the filters let through; left out while the sprint loads. */
  count: number | undefined;
  /** Assignee, where Clear filters puts focus (AC-33). */
  assigneeRef?: Ref<HTMLButtonElement>;
  /** Under 768 px, the search field, on its own line at the start (Q8g). */
  search?: ReactNode;
  /** The Project and Sprint pickers, before the filters (spec 020). */
  pickers?: ReactNode;
  /**
   * No sprint to filter (Q8c, spec 020 AC-28): the pickers alone, so another project is one pick away. They
   * stay the same elements either way, so a pick that empties or fills the page keeps focus where it was.
   */
  pickersOnly?: boolean;
}

const filterLabels: Record<FilterKey, string> = {
  assignee: 'Assignee',
  status: 'Status',
  type: 'Type',
  priority: 'Priority',
  due: 'Due',
};

/**
 * Tickets' five filters (spec 020, replacing spec 008's three chips) and the live count. The count is a polite status, so a screen reader
 * hears the new count when a filter or the search changes it (AC-31).
 */
export function TicketsToolbar({
  filters,
  onFiltersChange,
  options,
  onClear,
  count,
  assigneeRef,
  search,
  pickers,
  pickersOnly = false,
}: TicketsToolbarProps) {
  const { text: _, ...address } = filters;
  return (
    <Toolbar role="group" aria-label={pickersOnly ? 'Sprint' : 'Filters'}>
      {search === undefined || pickersOnly ? null : <div className="basis-full">{search}</div>}
      {pickers}
      {pickersOnly ? null : <Icon icon={FilterIcon} aria-hidden className="text-muted-foreground" />}
      {pickersOnly
        ? null
        : filterKeys.map((key) => (
            <FilterMenu
              key={key}
              {...(key === 'assignee' && assigneeRef !== undefined ? { ref: assigneeRef } : {})}
              label={filterLabels[key]}
              options={options[key]}
              ticked={address[key]}
              onTickedChange={(ticked) => {
                onFiltersChange({ ...address, [key]: ticked });
              }}
            />
          ))}
      {pickersOnly ? null : (
        <span className="ms-auto flex items-center gap-2">
          {hasExtraFilters(filters) ? (
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear filters
            </Button>
          ) : null}
          <span role="status" className="text-small text-muted-foreground">
            {count === undefined ? null : ticketCount(count)}
          </span>
        </span>
      )}
    </Toolbar>
  );
}
