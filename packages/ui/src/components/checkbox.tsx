import { useId, type ComponentProps, type ReactNode } from 'react';
import { Tick02Icon } from '@hugeicons/core-free-icons';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { cn } from '../lib/cn.ts';
import { Icon } from './icon.tsx';

export type CheckboxBoxProps = ComponentProps<typeof CheckboxPrimitive.Root>;

/**
 * The box alone, from shadcn's `checkbox` (Radix underneath): a hairline square that fills with ink around a tick
 * when checked, as a Menu's checkbox rows draw theirs (the user's call, 19 Oct 2026). 20 px; pass `size-4` for a
 * dense row. Name it with a `<label>` or an `aria-label`.
 */
export function CheckboxBox({ className, ...props }: CheckboxBoxProps) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-control bg-raised disabled:cursor-not-allowed disabled:opacity-45 data-[state=checked]:border-primary data-[state=checked]:bg-primary motion-safe:transition-colors',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="inline-flex motion-safe:animate-fade-in">
        <Icon icon={Tick02Icon} className="size-3.5 text-primary-foreground" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export interface CheckboxProps extends Omit<CheckboxBoxProps, 'children'> {
  /** What checking it means, in a few words; it names the checkbox. */
  label: ReactNode;
}

/**
 * A checkbox with its label, in a row at least 48 px tall that toggles wherever it's clicked (spec 005 Q5, drawn on
 * Settings › Inbox rules). A label that wraps keeps 12 px above and below. Rows in a list get their dividers from
 * the list. Read and change it with `checked` and `onCheckedChange`.
 */
export function Checkbox({ label, className, id, ...props }: CheckboxProps) {
  const madeUpId = useId();
  const checkboxId = id ?? `${madeUpId}-checkbox`;

  return (
    <label
      htmlFor={checkboxId}
      className={cn('flex min-h-12 cursor-pointer items-center gap-3 py-3 has-disabled:cursor-not-allowed', className)}
    >
      <CheckboxBox id={checkboxId} {...props} />
      <span className="min-w-0">{label}</span>
    </label>
  );
}
