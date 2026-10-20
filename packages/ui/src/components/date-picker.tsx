import { useId, useState, type FocusEventHandler, type Ref } from 'react';
import { Calendar03Icon } from '@hugeicons/core-free-icons';
import { cn } from '../lib/cn.ts';
import { Button } from './button.tsx';
import { Calendar } from './calendar.tsx';
import { useFieldControl } from './field.tsx';
import { Icon } from './icon.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './popover.tsx';

/** `2026-10-24` as that day at midnight, here. */
function dayOf(value: string): Date {
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** A day here as `2026-10-24`. */
function valueOf(day: Date): string {
  const two = (part: number) => String(part).padStart(2, '0');
  return `${String(day.getFullYear())}-${two(day.getMonth() + 1)}-${two(day.getDate())}`;
}

/** "24 Oct 2026". */
const plainDay = (day: Date) => day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export interface DatePickerProps {
  /** A calendar day, `YYYY-MM-DD`, or null for none. */
  value: string | null;
  onValueChange: (value: string | null) => void;
  /** What the field reads with no day, which also names the calendar: "Pick a date". */
  placeholder: string;
  /** The button under the calendar that empties the field: "Clear date". */
  clearLabel: string;
  /** How a picked day reads in the field; "24 Oct 2026" by default. */
  formatDay?: (day: Date) => string;
  /** For a form: called when focus leaves the field. */
  onBlur?: FocusEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * A day, picked from a calendar (spec 037, Q15): shadcn's date picker, `Popover` around `Calendar`. The field looks
 * as Select's trigger does, with a calendar icon, and takes its label, help and error from `<Field>`. The calendar
 * opens on the picked day or today, with that day focused; picking a day closes it and puts focus back on the field.
 */
export function DatePicker({
  value,
  onValueChange,
  placeholder,
  clearLabel,
  formatDay = plainDay,
  onBlur,
  disabled = false,
  className,
  ref,
}: DatePickerProps) {
  const field = useFieldControl();
  const [open, setOpen] = useState(false);
  const valueId = useId();
  const picked = value === null ? undefined : dayOf(value);
  // The field's name comes from its label, so what it holds is said as its description.
  const describedBy = [valueId, field?.describedBy].filter((id) => id !== undefined).join(' ');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={ref}
          type="button"
          data-slot="date-picker"
          disabled={disabled}
          onBlur={onBlur}
          {...(field ? { id: field.id, 'aria-invalid': field.invalid || undefined } : {})}
          aria-describedby={describedBy}
          className={cn(
            'flex h-10 w-full min-w-0 cursor-pointer items-center gap-2 rounded-sm border border-control bg-raised px-3 text-start text-body text-foreground not-aria-invalid:enabled:hover:border-muted-foreground disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-danger',
            className,
          )}
        >
          <span id={valueId} className={cn('min-w-0 flex-1 truncate', picked === undefined && 'text-placeholder')}>
            {picked === undefined ? placeholder : formatDay(picked)}
          </span>
          <Icon icon={Calendar03Icon} aria-hidden className="text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={placeholder}
        className="flex flex-col gap-2"
        // Focus goes to the picked day, else today, else the month's first, not the popover's first button: the date
        // picker dialog pattern (WAI-ARIA APG), so the arrows move between days at once.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const grid = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
          const day =
            grid?.querySelector<HTMLButtonElement>('[role="grid"] button[data-picked]') ??
            grid?.querySelector<HTMLButtonElement>('[role="grid"] button[data-today]') ??
            grid?.querySelector<HTMLButtonElement>('[role="grid"] button:not([disabled])');
          day?.focus();
        }}
      >
        <Calendar
          mode="single"
          {...(picked === undefined ? {} : { selected: picked, defaultMonth: picked })}
          onSelect={(day) => {
            if (day !== undefined) onValueChange(valueOf(day));
            setOpen(false);
          }}
        />
        {value === null ? null : (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => {
              onValueChange(null);
              setOpen(false);
            }}
          >
            {clearLabel}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
