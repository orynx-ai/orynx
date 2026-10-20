import { useState } from 'react';
import { Button, Dialog, DialogTrigger, StatusDot } from '@devhub/ui';
import { buttonName } from '../sync-words.ts';
import { SyncActivityDialog } from './sync-activity-dialog.tsx';

/**
 * Home's Sync activity button (spec 035, Q1): opens the sync log. Its dot is green while syncs go well and red, with
 * its name saying how many, when tools need attention (the user's call, 20 Oct 2026). The log is read only while the
 * dialog is open.
 */
export function SyncActivityButton({ attention }: { attention: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" aria-label={buttonName(attention)}>
          <StatusDot tone={attention > 0 ? 'danger' : 'success'} />
          Sync activity
        </Button>
      </DialogTrigger>
      {open ? (
        <SyncActivityDialog
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </Dialog>
  );
}
