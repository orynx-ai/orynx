import type { TicketColumn } from '@devhub/contracts';
import type { PillTone } from '@devhub/ui';

/** AC-11: the list's status pill in its column's colour, as the design system gives each status. */
export const statusTones: Record<TicketColumn, PillTone> = {
  to_do: 'neutral',
  in_progress: 'warning',
  in_review: 'info',
  done: 'success',
};
