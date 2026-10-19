import { useRef, useState, type MouseEvent } from 'react';
import { Cancel01Icon, File01Icon } from '@hugeicons/core-free-icons';
import type { ComposerChip } from '@devhub/contracts';
import {
  AttentionList,
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
import { chipLabel, composerWords, removedLine } from '../composer-words.ts';
import { useComposerStore } from '../store.ts';

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

/** The second line: what search knows of a ticket or a pull request; nothing for one it doesn't hold. */
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
    return null;
  };
}

export interface ContextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes when it closes: +N while it's there, else the composer's box. */
  returnFocusTo: () => HTMLElement | null;
}

/**
 * Everything the composer holds, by kind (spec 022, AC-20 to AC-24): the tabs Tickets, Pull requests and Files,
 * each row with what it is and Remove. It opens on the first tab that holds something, and closes by itself
 * once nothing's left.
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
  const chips = useComposerStore((state) => state.chips);
  const removeChip = useComposerStore((state) => state.removeChip);
  const subLine = useSubLine();
  const [tab, setTab] = useState<Tab>(
    () => tabs.find((name) => chips.some((chip) => chip.kind === kindOf[name])) ?? 'tickets',
  );
  const [removed, setRemoved] = useState('');
  const content = useRef<HTMLDivElement>(null);

  function remove(event: MouseEvent<HTMLButtonElement>, index: number, label: string) {
    // Focus moves on before the row goes: to the next row's Remove, else to the tab (AC-21).
    const next = event.currentTarget.closest('li')?.nextElementSibling?.querySelector('button');
    const selected = content.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    (next ?? selected)?.focus();
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
          {tabs.map((name) => (
            <TabsTrigger key={name} value={name} count={chips.filter((chip) => chip.kind === kindOf[name]).length}>
              {words.tabs[name]}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((name) => {
          const rows = chips.flatMap((chip, index) => (chip.kind === kindOf[name] ? [{ chip, index }] : []));
          return (
            <TabsContent key={name} value={name} className="min-h-0 overflow-y-auto">
              {rows.length === 0 ? (
                <p className="m-0 px-6 py-4 text-muted-foreground">{words.empty[name]}</p>
              ) : (
                <AttentionList>
                  {rows.map(({ chip, index }) => {
                    const label = chipLabel(chip);
                    const sub = subLine(chip);
                    return (
                      <li key={`${chip.kind}:${label}`} className="flex min-h-14 items-center gap-3 px-6 py-2.5">
                        {mark(chip)}
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate font-medium">{label}</span>
                          {sub === null ? null : (
                            <span className="truncate text-small text-muted-foreground">{sub}</span>
                          )}
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
              )}
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
