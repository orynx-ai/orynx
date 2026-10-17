import { useId, useState, type ReactNode } from 'react';
import { Button } from '@devhub/ui';
import { ConnectionRow, type ConnectionRowProps } from './connection-row.tsx';

/** What a row hands its form. */
export interface FormControls {
  /** The form's id, which the row's button points at. */
  id: string;
  /** Closes the form, says `announcement` if given, and puts focus back on the row's button. */
  close: (announcement?: string) => void;
}

export interface ManagedConnectionRowProps extends Omit<ConnectionRowProps, 'action' | 'children'> {
  /** Something is saved, so the button reads Manage instead of Connect. */
  configured: boolean;
  /** A Connect or Disconnect is on its way. */
  changing: boolean;
  /** The saved settings the form starts from could not be loaded. */
  loadFailed: boolean;
  /** Says a message politely; the Connections panel owns the one live region. */
  announce: (message: string) => void;
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
  announce,
  form,
  ...row
}: ManagedConnectionRowProps) {
  const [open, setOpen] = useState(false);
  // The button itself, kept through a callback ref: the form is drawn by calling `form`, and a
  // `close` that read a ref object could not be handed to it during render.
  const [toggle, setToggle] = useState<HTMLButtonElement | null>(null);
  const formId = useId();

  function close(message?: string) {
    setOpen(false);
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
          // Closing the form can't stop a Connect or Disconnect on its way. aria-disabled, not
          // disabled, so focus can land here the moment the change finishes.
          aria-disabled={changing || undefined}
          aria-controls={open && form ? formId : undefined}
          onClick={() => {
            if (changing) return;
            if (open) close();
            else {
              announce('');
              setOpen(true);
            }
          }}
        >
          {open ? 'Close' : configured ? 'Manage' : 'Connect'}
        </Button>
      }
    >
      {open && loadFailed ? (
        <p role="alert" className="m-0 text-small text-danger sm:ps-14">
          Could not reach the DevHub server. Check that DevHub is still running in your terminal, then reload the page.
        </p>
      ) : null}
      {open && form ? <div className="sm:ps-14">{form({ id: formId, close })}</div> : null}
    </ConnectionRow>
  );
}
