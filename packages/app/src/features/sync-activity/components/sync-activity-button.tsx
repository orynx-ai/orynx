import { Rotate01Icon } from '@hugeicons/core-free-icons';
import { useState } from 'react';
import { Button, Dialog, DialogTrigger, Icon, StatusDot } from '@devhub/ui';
import { buttonName } from '../sync-words.ts';
import { SyncActivityDialog } from './sync-activity-dialog.tsx';

/**
 * Home's Sync activity button (spec 035, Q1): opens the sync log. A red dot, and its name, say how many
 * tools need attention. The log is read only while the dialog is open.
 */
export function SyncActivityButton({ attention }: { attention: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" aria-label={buttonName(attention)}>
          <Icon icon={Rotate01Icon} aria-hidden />
          Sync activity
          {attention > 0 ? <StatusDot tone="danger" /> : null}
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
