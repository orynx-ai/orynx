import type { Ref } from 'react';
import { Funnel } from 'lucide-react';
import { Button, FilterChip } from '@devhub/ui';
import { Toolbar } from '../../../shell/page-frame.tsx';
import { hasExtraFilters, type AddressFilters, type TicketFilters } from '../filters.ts';
import { ticketCount } from '../ticket-words.ts';

export interface TicketsToolbarProps {
  filters: TicketFilters;
  onFiltersChange: (filters: AddressFilters) => void;
  /** Back to Assigned to me only, with the search emptied (Q3f). */
  onClear: () => void;
  /** How many tickets the filters let through; left out while the sprint loads. */
  count: number | undefined;
  /** Assigned to me, where Clear filters puts focus (AC-9). */
  assignedToMeRef?: Ref<HTMLButtonElement>;
}

/**
 * Tickets' filters (spec 008, Q3) and the live count. The count is a polite status, so a screen reader
 * hears the new count when a filter or the search changes it (AC-31).
 */
export function TicketsToolbar({ filters, onFiltersChange, onClear, count, assignedToMeRef }: TicketsToolbarProps) {
  const { mine, dueThisWeek, bugsOnly } = filters;
  return (
    <Toolbar role="group" aria-label="Filters">
      <Funnel aria-hidden className="text-muted-foreground" />
      <FilterChip
        ref={assignedToMeRef}
        pressed={mine}
        onPressedChange={(pressed) => {
          onFiltersChange({ mine: pressed, dueThisWeek, bugsOnly });
        }}
      >
        Assigned to me
      </FilterChip>
      <FilterChip
        pressed={dueThisWeek}
        onPressedChange={(pressed) => {
          onFiltersChange({ mine, dueThisWeek: pressed, bugsOnly });
        }}
      >
        Due this week
      </FilterChip>
      <FilterChip
        pressed={bugsOnly}
        onPressedChange={(pressed) => {
          onFiltersChange({ mine, dueThisWeek, bugsOnly: pressed });
        }}
      >
        Bugs only
      </FilterChip>
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
    </Toolbar>
  );
}
