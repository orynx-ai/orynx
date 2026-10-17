import { useId, type ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

export interface ChoiceGroupProps {
  /** Visible legend; it names the group. */
  legend: string;
  /** One line under the choices. */
  help?: ReactNode;
  /** Says what to do. It replaces the help line, so the group doesn't grow when one shows. */
  error?: ReactNode;
  className?: string;
  /** The `<ChoiceCard>`s, sharing one `name`. */
  children: ReactNode;
}

/**
 * A set of `<ChoiceCard>`s where one is picked, as the design system draws Settings › Coding agent and
 * Appearance: a fieldset with its legend, then the cards. It is a `radiogroup`, so an error can mark it
 * invalid and describe it, the way `<Field>` does for one input.
 */
export function ChoiceGroup({ legend, help, error, className, children }: ChoiceGroupProps) {
  const id = useId();
  const legendId = `${id}-legend`;
  const messageId = `${id}-message`;
  const hasError = error !== undefined && error !== null && error !== false && error !== '';
  const message = hasError ? error : help;

  return (
    <fieldset
      // ARIA in HTML allows `radiogroup` on a fieldset; `group`, its own role, can't carry aria-invalid.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role -- see above
      role="radiogroup"
      aria-labelledby={legendId}
      aria-describedby={message === undefined ? undefined : messageId}
      aria-invalid={hasError || undefined}
      className={cn('m-0 flex min-w-0 flex-col gap-2 border-0 p-0', className)}
    >
      <legend id={legendId} className="mb-2 p-0 font-medium">
        {legend}
      </legend>
      {children}
      {message === undefined ? null : (
        <span id={messageId} className={cn('text-small', hasError ? 'text-danger' : 'text-muted-foreground')}>
          {message}
        </span>
      )}
    </fieldset>
  );
}
