import { createContext, use, useId, type ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

interface FieldControl {
  id: string;
  /** The help line or the error, whichever shows. */
  describedBy: string | undefined;
  invalid: boolean;
}

const FieldContext = createContext<FieldControl | null>(null);

/** For a control inside `<Field>`: the id, description and invalid state it must carry. */
export function useFieldControl(): FieldControl | null {
  return use(FieldContext);
}

export interface FieldProps {
  /** Visible label. A placeholder never stands in for it. */
  label: string;
  /** One line under the control. It may hold a link, such as "Create an API token". */
  help?: ReactNode;
  /**
   * Says what to do ("Enter the address you open Jira at."). It replaces the help line, and may carry
   * the help line's link when the message points to it ("create a new token").
   */
  error?: ReactNode;
  /** Id for the control; one is made up when left out. */
  id?: string;
  className?: string;
  /** One control, such as `<Input>`. It picks up its id, description and invalid state from the field. */
  children: ReactNode;
}

/**
 * Design system: Input's field (`dh-field`): a label, the control, then help or an error. The error
 * takes the help line's place instead of adding a line, so a form doesn't grow when one shows.
 */
export function Field({ label, help, error, id, className, children }: FieldProps) {
  const madeUpId = useId();
  const controlId = id ?? `${madeUpId}-control`;
  const messageId = `${controlId}-message`;
  const message = error ?? help;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={controlId} className="text-small font-medium text-foreground">
        {label}
      </label>
      <FieldContext
        value={{
          id: controlId,
          describedBy: message === undefined ? undefined : messageId,
          invalid: error !== undefined,
        }}
      >
        {children}
      </FieldContext>
      {message === undefined ? null : (
        <span
          id={messageId}
          className={cn('text-small', error === undefined ? 'text-muted-foreground' : 'text-danger')}
        >
          {message}
        </span>
      )}
    </div>
  );
}
