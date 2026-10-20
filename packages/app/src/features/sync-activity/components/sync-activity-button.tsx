import { useState } from 'react';
import { Clock01Icon } from '@hugeicons/core-free-icons';
import { Button, Dialog, DialogTrigger, Icon, StatusDot, Tooltip } from '@devhub/ui';
import { buttonName } from '../sync-words.ts';
import { SyncActivityDialog } from './sync-activity-dialog.tsx';

/**
 * The sync log's button (spec 035, Q1), now the "Synced just now" line itself (spec 039, Q2: the line is the button,
 * and the separate Sync activity button went). Its dot is green while syncs go well and red, with its name saying how
 * many, when tools need attention (the user's call, 20 Oct 2026). Under 1280 px, where a page bar has less room, the
 * line gives way to the history icon beside the dot; its tooltip says Sync activity at every width. Its name starts
 * with the line, so voice control reaches it. The log is read only while the dialog is open.
 */
export function SyncActivityButton({ attention, line }: { attention: number; line: string | null }) {
  const [open, setOpen] = useState(false);
  const name = buttonName(attention);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip label="Sync activity">
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="font-normal text-muted-foreground"
            aria-label={line === null ? name : `${line}, ${name}`}
          >
            <StatusDot tone={attention > 0 ? 'danger' : 'success'} />
            <span className="max-xl:hidden">{line ?? 'Sync activity'}</span>
            <Icon icon={Clock01Icon} aria-hidden className="xl:hidden" />
          </Button>
        </DialogTrigger>
      </Tooltip>
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
