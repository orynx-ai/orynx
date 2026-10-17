import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

export interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type'> {
  /** What checking it means, in a few words; it names the checkbox. */
  label: ReactNode;
}

/**
 * A native checkbox with its label, in a row at least 48 px tall that toggles wherever it's clicked (spec
 * 005 Q5, drawn on Settings › Inbox rules). It takes the `info` colour when checked. The browser draws
 * the box and the tick, as it draws ChoiceCard's radio, so the tick keeps its contrast in both themes.
 * Rows in a list get their dividers from the list.
 */
export function Checkbox({ label, className, id, ...props }: CheckboxProps) {
  const madeUpId = useId();
  const checkboxId = id ?? `${madeUpId}-checkbox`;

  return (
    <label
      htmlFor={checkboxId}
      className={cn('flex min-h-12 cursor-pointer items-center gap-3 has-disabled:cursor-not-allowed', className)}
    >
      <input
        type="checkbox"
        id={checkboxId}
        className="m-0 size-5 shrink-0 accent-info disabled:opacity-45"
        {...props}
      />
      <span className="min-w-0">{label}</span>
    </label>
  );
}
