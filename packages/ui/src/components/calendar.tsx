import { useEffect, useRef, type ComponentProps } from 'react';
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { DayPicker, type DayButtonProps, type Modifiers } from 'react-day-picker';
import { cn } from '../lib/cn.ts';
import { Icon } from './icon.tsx';
import { IconButton } from './icon-button.tsx';

export type CalendarProps = ComponentProps<typeof DayPicker>;

/**
 * A month to pick a day from (spec 037, Q15). From shadcn's `calendar` (react-day-picker underneath), restyled to the
 * tokens: 36 px days, the picked one in `primary`, today in medium weight, days of the months either side quieter,
 * and the months either side behind icon buttons with their tooltips.
 * The keyboard is react-day-picker's: the arrows move a day or a week, Page Up and Page Down a month, Home and End
 * to the week's ends, Enter or Space picks.
 */
/**
 * A day's name for screen readers, starting with the number it shows, so what's read matches what's seen (WCAG
 * 2.5.3): "24 October 2026, today, selected".
 */
function dayName(date: Date, modifiers: Modifiers): string {
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return [day, modifiers['today'] ? 'today' : null, modifiers['selected'] ? 'selected' : null]
    .filter((part) => part !== null)
    .join(', ');
}

export function Calendar({ className, classNames, labels, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      data-slot="calendar"
      showOutsideDays={showOutsideDays}
      labels={{ labelDayButton: dayName, ...labels }}
      className={cn('w-fit', className)}
      classNames={{
        months: 'relative flex flex-col',
        month: 'flex flex-col gap-2',
        nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
        month_caption: 'flex h-8 items-center justify-center',
        caption_label: 'text-body font-medium',
        month_grid: 'border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 text-label font-normal text-muted-foreground',
        week: 'mt-1 flex',
        day: 'size-9 p-0 text-center',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        // Icon-only, so each has its tooltip, as every icon button does.
        PreviousMonthButton: ({ className: _, children: __, 'aria-label': ___, ...props }) => (
          <IconButton variant="ghost" size="sm" label="Previous month" {...props}>
            <Icon icon={ArrowLeft01Icon} aria-hidden />
          </IconButton>
        ),
        NextMonthButton: ({ className: _, children: __, 'aria-label': ___, ...props }) => (
          <IconButton variant="ghost" size="sm" label="Next month" {...props}>
            <Icon icon={ArrowRight01Icon} aria-hidden />
          </IconButton>
        ),
        DayButton: CalendarDay,
      }}
      {...props}
    />
  );
}

/** One day, as react-day-picker's own: it takes focus as the keyboard moves to it. */
function CalendarDay({ day: _day, modifiers, className, ...props }: DayButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (modifiers['focused']) ref.current?.focus();
  }, [modifiers['focused']]);
  return (
    <button
      ref={ref}
      data-picked={modifiers['selected'] ? '' : undefined}
      data-today={modifiers['today'] ? '' : undefined}
      data-outside={modifiers['outside'] ? '' : undefined}
      className={cn(
        'size-9 cursor-pointer rounded-sm text-body text-foreground hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-45',
        'data-outside:text-muted-foreground data-today:font-medium',
        'data-picked:bg-primary data-picked:text-primary-foreground data-picked:hover:bg-primary',
        className,
      )}
      {...props}
    />
  );
}
