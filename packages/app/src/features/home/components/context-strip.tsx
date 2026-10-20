import { useRef, useState } from 'react';
import { File01Icon } from '@hugeicons/core-free-icons';
import { type ComposerChip, ticketSource } from '@devhub/contracts';
import { ContextChip, ContextList, ContextMore, Icon, SourceMark } from '@devhub/ui';
import { useTicketDialogStore } from '../../tickets/ticket-dialog-store.ts';
import { useComposerChips } from '../composer-chips.tsx';
import { chipLabel, composerWords, removedLine } from '../composer-words.ts';
import { ContextDialog } from './context-dialog.tsx';

/** The composer shows this many chips, then +N (spec 022, Q6). */
const shownChips = 2;

/** The chip's mark: the tool's own for a ticket or a pull request, a file icon for a file. */
function chipIcon(chip: ComposerChip) {
  if (chip.kind === 'jira') return <SourceMark source={ticketSource(chip.key)} label="none" />;
  if (chip.kind === 'pull_request') return <SourceMark source="github" label="none" />;
  return <Icon icon={File01Icon} aria-hidden />;
}

/**
 * The chips above a composer's box (spec 022, Q6): the first two in the order added, then +N for the rest, which
 * opens the context dialog. A ticket's chip opens the ticket dialog. Removing one is said to screen readers. Home's
 * composer and a follow-up's both draw it, each with its own chips (spec 025).
 */
export function ContextStrip({ box }: { box: () => HTMLElement | null }) {
  const { chips, removeChip } = useComposerChips();
  const showTicket = useTicketDialogStore((state) => state.show);
  const [removed, setRemoved] = useState('');
  // Whether the dialog with every chip is open (spec 022, AC-20).
  const [allContext, setAllContext] = useState(false);
  const more = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      {chips.length === 0 ? null : (
        <ContextList aria-label={composerWords.contextList}>
          {chips.slice(0, shownChips).map((chip, index) => {
            const label = chipLabel(chip);
            return (
              <ContextChip
                key={`${chip.kind}:${label}`}
                label={label}
                icon={chipIcon(chip)}
                onOpen={
                  chip.kind === 'jira'
                    ? () => {
                        showTicket({ key: chip.key, title: null, type: null, url: null });
                      }
                    : undefined
                }
                onRemove={() => {
                  removeChip(index);
                  setRemoved(removedLine(label));
                }}
              />
            );
          })}
          {chips.length > shownChips ? (
            <ContextMore
              ref={more}
              count={chips.length - shownChips}
              label={composerWords.more.label(chips.length)}
              tooltip={composerWords.more.tooltip}
              onClick={() => {
                setAllContext(true);
              }}
            />
          ) : null}
        </ContextList>
      )}
      <p role="status" className="sr-only">
        {removed}
      </p>
      <ContextDialog
        open={allContext}
        onOpenChange={setAllContext}
        returnFocusTo={() => (more.current?.isConnected === true ? more.current : box())}
      />
    </>
  );
}
