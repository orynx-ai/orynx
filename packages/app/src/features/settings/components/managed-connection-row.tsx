import { useId, useState, type ReactNode } from 'react';
import { Cancel01Icon, Plug01Icon, Settings02Icon } from '@hugeicons/core-free-icons';
import { Button, Icon } from '@devhub/ui';
import { ConnectionRow, type ConnectionRowProps } from './connection-row.tsx';

/** What a row hands its form. */
export interface FormControls {
  /** The form's id, which the row's button points at. */
  id: string;
  /** Closes the form, says `announcement` if given, and puts focus back on the row's button. */
  close: (announcement?: string) => void;
  /** Says a message politely, for news that focus can't carry. */
  announce: (message: string) => void;
}

/**
 * What the Connections panel hands each row: only one form is open at a time, so the page never has two
 * primary buttons, and one live region says what happened.
 */
export interface RowControls {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Says a message politely; the Connections panel owns the one live region. */
  announce: (message: string) => void;
}

export interface ManagedConnectionRowProps extends Omit<ConnectionRowProps, 'action' | 'children'>, RowControls {
  /** Something is saved, so the button reads Manage instead of Connect. */
  configured: boolean;
  /** A Connect or Disconnect is on its way, for this tool or another. */
  changing: boolean;
  /** The saved settings the form starts from could not be loaded. */
  loadFailed: boolean;
  /** The form, once the saved settings it starts from have arrived. */
  form: ((controls: FormControls) => ReactNode) | undefined;
}

/**
 * A tool's row whose Connect or Manage button opens its form inside the row, and reads Close while it
 * is open (spec 003 Q3, reused by 004).
 */
export function ManagedConnectionRow({
  configured,
  changing,
  loadFailed,
  open,
  onOpenChange,
  announce,
  form,
  ...row
}: ManagedConnectionRowProps) {
  // The button itself, kept through a callback ref: the form is drawn by calling `form`, and a
  // `close` that read a ref object could not be handed to it during render.
  const [toggle, setToggle] = useState<HTMLButtonElement | null>(null);
  const formId = useId();

  function close(message?: string) {
    onOpenChange(false);
    if (message !== undefined) announce(message);
    toggle?.focus();
  }

  return (
    <ConnectionRow
      {...row}
      action={
        <Button
          ref={setToggle}
          size="sm"
          aria-expanded={open}
          // Closing the form can't stop a Connect or Disconnect on its way, and opening another would
          // close it. aria-disabled, not disabled, so focus can land here the moment the change finishes.
          aria-disabled={changing || undefined}
          aria-controls={open && form ? formId : undefined}
          onClick={() => {
            if (changing) return;
            if (open) close();
            else {
              announce('');
              onOpenChange(true);
            }
          }}
        >
          <Icon icon={open ? Cancel01Icon : configured ? Settings02Icon : Plug01Icon} aria-hidden />
          {open ? 'Close' : configured ? 'Manage' : 'Connect'}
        </Button>
      }
    >
      {open && loadFailed ? (
        <p role="alert" className="m-0 text-small text-danger sm:ps-14">
          Could not reach the Orynx server. Check that Orynx is still running in your terminal, then reload the page.
        </p>
      ) : null}
      {open && form ? <div className="sm:ps-14">{form({ id: formId, close, announce })}</div> : null}
    </ConnectionRow>
  );
}
