import { useRef, useState, type MouseEvent } from 'react';
import { Cancel01Icon, File01Icon } from '@hugeicons/core-free-icons';
import type { ComposerChip } from '@devhub/contracts';
import {
  AttentionList,
  AttentionTitleButton,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Icon,
  IconButton,
  SourceMark,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@devhub/ui';
import { useSearchIndex } from '../../search/queries.ts';
import { useTicketDialogStore } from '../../tickets/ticket-dialog-store.ts';
import { chipLabel, composerWords, removedLine } from '../composer-words.ts';
import { useComposerChips } from '../composer-chips.tsx';

const words = composerWords.dialog;
type Tab = keyof typeof words.tabs;
const tabs = ['tickets', 'pull_requests', 'files'] as const satisfies readonly Tab[];
const kindOf = { tickets: 'jira', pull_requests: 'pull_request', files: 'file' } as const satisfies Record<
  Tab,
  ComposerChip['kind']
>;

function mark(chip: ComposerChip) {
  if (chip.kind === 'jira') return <SourceMark source="jira" label="none" />;
  if (chip.kind === 'pull_request') return <SourceMark source="github" label="none" />;
  return <Icon icon={File01Icon} aria-hidden className="text-muted-foreground" />;
}

/**
 * The second line: what search knows of a ticket or a pull request, nothing for one it doesn't hold; a file's full
 * path (spec 022, AC-20).
 */
function useSubLine(): (chip: ComposerChip) => string | null {
  const index = useSearchIndex();
  return (chip) => {
    if (chip.kind === 'jira') {
      const ticket = index.data?.tickets.find((known) => known.key === chip.key);
      return ticket === undefined ? null : `${ticket.title} · ${ticket.status}`;
    }
    if (chip.kind === 'pull_request') {
      const id = `${chip.owner}/${chip.name}#${String(chip.number)}`.toLowerCase();
      return index.data?.pullRequests.find((known) => known.id.toLowerCase() === id)?.title ?? null;
    }
    return chip.path;
  };
}

export interface ContextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes when it closes: +N while it's there, else the composer's box. */
  returnFocusTo: () => HTMLElement | null;
}

/**
 * Everything the composer holds, by kind (spec 022, AC-20 to AC-24): a tab for each of Tickets, Pull requests and
 * Files that holds something, each row with what it is and Remove; a ticket's key opens the ticket dialog. It
 * opens on the first tab, and closes by itself once nothing's left.
 */
export function ContextDialog({ open, onOpenChange, returnFocusTo }: ContextDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Drawn afresh each time it opens, so it starts on the first tab that holds something (AC-22). */}
      {open ? <ContextDialogContent onOpenChange={onOpenChange} returnFocusTo={returnFocusTo} /> : null}
    </Dialog>
  );
}

function ContextDialogContent({ onOpenChange, returnFocusTo }: Omit<ContextDialogProps, 'open'>) {
  const { chips, removeChip } = useComposerChips();
  const subLine = useSubLine();
  const showTicket = useTicketDialogStore((state) => state.show);
  // A kind with nothing in it has no tab (the user's call, 19 Oct 2026).
  const shown = tabs.filter((name) => chips.some((chip) => chip.kind === kindOf[name]));
  const [picked, setTab] = useState<Tab>(() => shown[0] ?? 'tickets');
  const tab = shown.includes(picked) ? picked : (shown[0] ?? picked);
  const [removed, setRemoved] = useState('');
  const content = useRef<HTMLDivElement>(null);

  function remove(event: MouseEvent<HTMLButtonElement>, index: number, label: string) {
    // Focus moves on before the row goes: to the next row's Remove, else to the tab (AC-21), or to the first other
    // tab when this tab goes with its last row.
    const row = event.currentTarget.closest('li');
    // Remove is the row's last button; a ticket's key is a button before it.
    const next = [...(row?.nextElementSibling?.querySelectorAll<HTMLElement>('button') ?? [])].at(-1);
    const lastOfTab = row?.parentElement?.children.length === 1;
    const tabTo = content.current?.querySelector<HTMLElement>(
      `[role="tab"][aria-selected="${lastOfTab ? 'false' : 'true'}"]`,
    );
    (next ?? tabTo)?.focus();
    const last = chips.length === 1;
    removeChip(index);
    setRemoved(removedLine(label));
    // Nothing left to show: the dialog closes, and focus goes to the box (AC-23).
    if (last) onOpenChange(false);
  }

  return (
    <DialogContent
      ref={content}
      onCloseAutoFocus={(event) => {
        const target = returnFocusTo();
        if (target === null) return;
        event.preventDefault();
        target.focus();
      }}
    >
      <DialogTitle className="px-6 pt-6">{words.title}</DialogTitle>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as Tab);
        }}
        className="flex min-h-0 flex-col"
      >
        <TabsList className="shrink-0 px-6">
          {shown.map((name) => (
            <TabsTrigger key={name} value={name} count={chips.filter((chip) => chip.kind === kindOf[name]).length}>
              {words.tabs[name]}
            </TabsTrigger>
          ))}
        </TabsList>
        {shown.map((name) => {
          const rows = chips.flatMap((chip, index) => (chip.kind === kindOf[name] ? [{ chip, index }] : []));
          return (
            <TabsContent key={name} value={name} className="min-h-0 overflow-y-auto">
              <AttentionList>
                {rows.map(({ chip, index }) => {
                  const label = chipLabel(chip);
                  const sub = subLine(chip);
                  return (
                    <li key={`${chip.kind}:${label}`} className="flex min-h-14 items-center gap-3 px-6 py-2.5">
                      {mark(chip)}
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        {chip.kind === 'jira' ? (
                          <AttentionTitleButton
                            onClick={() => {
                              showTicket({ key: chip.key, title: null, type: null, url: null });
                            }}
                          >
                            {label}
                          </AttentionTitleButton>
                        ) : (
                          <span className="truncate font-medium">{label}</span>
                        )}
                        {sub === null ? null : <span className="truncate text-small text-muted-foreground">{sub}</span>}
                      </div>
                      <IconButton
                        variant="ghost"
                        size="sm"
                        label={words.remove}
                        aria-label={composerWords.remove(label)}
                        onClick={(event) => {
                          remove(event, index, label);
                        }}
                      >
                        <Icon icon={Cancel01Icon} aria-hidden />
                      </IconButton>
                    </li>
                  );
                })}
              </AttentionList>
            </TabsContent>
          );
        })}
      </Tabs>
      <div className="flex shrink-0 justify-end border-t border-border px-6 py-4">
        <Button
          variant="secondary"
          onClick={() => {
            onOpenChange(false);
          }}
        >
          {words.done}
        </Button>
      </div>
      {/* The page behind is hidden from screen readers while the dialog is open, so it says removals itself. */}
      <p role="status" className="sr-only">
        {removed}
      </p>
    </DialogContent>
  );
}
