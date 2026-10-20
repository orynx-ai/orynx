import { useState } from 'react';
import { Clock01Icon } from '@hugeicons/core-free-icons';
import { Button, Dialog, DialogTrigger, Icon, IconButton, StatusDot } from '@devhub/ui';
import { useWide } from '../../../shell/use-wide.ts';
import { buttonName } from '../sync-words.ts';
import { SyncActivityDialog } from './sync-activity-dialog.tsx';

/**
 * The sync log's button (spec 035, Q1), now the "Synced just now" line itself (spec 039, Q2: the line is the button,
 * and the separate Sync activity button went). Its dot is green while syncs go well and red, with its name saying how
 * many, when tools need attention (the user's call, 20 Oct 2026). Its name starts with its words, so voice control
 * reaches it. Under 768 px, where the line has no room, it is the dot on the history icon. The log is read only while
 * the dialog is open.
 */
export function SyncActivityButton({ attention, line }: { attention: number; line: string | null }) {
  const [open, setOpen] = useState(false);
  const wide = useWide();
  const tone = attention > 0 ? 'danger' : 'success';
  const name = buttonName(attention);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {wide ? (
          <Button
            variant="ghost"
            size="sm"
            className="font-normal text-muted-foreground"
            aria-label={line === null ? name : `${line}, ${name}`}
          >
            <StatusDot tone={tone} />
            {line ?? 'Sync activity'}
          </Button>
        ) : (
          <IconButton variant="ghost" size="sm" label="Sync activity" aria-label={name} className="relative">
            <Icon icon={Clock01Icon} aria-hidden />
            <StatusDot tone={tone} className="absolute end-1.5 top-1.5" />
          </IconButton>
        )}
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
