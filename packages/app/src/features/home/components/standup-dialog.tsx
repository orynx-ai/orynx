import { useEffect, useId, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import type { Standup } from '@devhub/contracts';
import { Button, CopyButton, Dialog, DialogContent, DialogFoot, DialogTitle, Skeleton, Textarea } from '@devhub/ui';
import { composerWords } from '../composer-words.ts';
import { useStandup } from '../queries.ts';

const words = composerWords.standup;

/**
 * Write my standup (spec 057, C): Orynx's draft for your last working day in a box you can edit, Copy, and Close.
 * Orynx posts nothing (Q4); you paste it yourself. Design: none, built from parts that exist (Q8).
 */
export function StandupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const standup = useStandup(open);
  const titleId = useId();
  const close = (
    <Button variant="secondary" onClick={onClose}>
      {words.close}
    </Button>
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {open ? (
        <DialogContent size="narrow" aria-labelledby={titleId}>
          {standup.data === undefined ? (
            <>
              <div className="flex flex-col gap-4 p-6">
                <DialogTitle id={titleId}>{words.title}</DialogTitle>
                {standup.isError ? (
                  <p className="m-0 flex flex-wrap items-center gap-2 text-small text-muted-foreground">
                    {words.failed}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void standup.refetch();
                      }}
                    >
                      {words.tryAgain}
                    </Button>
                  </p>
                ) : (
                  // The box's own size while Orynx drafts, so nothing moves when the draft comes.
                  <div aria-busy="true" className="flex flex-col gap-2">
                    {[0, 1, 2, 3, 4, 5].map((line) => (
                      <Skeleton key={line} className="h-5 w-full" />
                    ))}
                  </div>
                )}
              </div>
              <DialogFoot>{close}</DialogFoot>
            </>
          ) : (
            <Draft standup={standup.data} titleId={titleId} close={close} />
          )}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/** The draft as you edit it, kept by the form, never in state of its own (forms skill). */
function Draft({ standup, titleId, close }: { standup: Standup; titleId: string; close: ReactNode }) {
  const form = useForm<{ text: string }>({ defaultValues: { text: standup.text } });
  const text = form.watch('text');
  useEffect(() => {
    form.setFocus('text');
  }, [form]);
  return (
    <>
      <div className="flex flex-col gap-4 p-6">
        <DialogTitle id={titleId}>{words.title}</DialogTitle>
        <Textarea aria-labelledby={titleId} rows={12} {...form.register('text')} />
        {standup.missing.map((source) => (
          <p key={source} className="m-0 text-small text-muted-foreground">
            {words.missing[source]}
          </p>
        ))}
      </div>
      <DialogFoot>
        <CopyButton text={text} label="Copy" what={words.copy} />
        {close}
      </DialogFoot>
    </>
  );
}
