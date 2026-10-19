import { useRef, useState, type ChangeEvent } from 'react';
import { File01Icon, Folder01Icon, GitBranchIcon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { Link } from '@tanstack/react-router';
import type { ComposerChip, InboxToolState } from '@devhub/contracts';
import {
  ContextKindItem,
  ContextPicker,
  ContextPickerContent,
  ContextPickerLabel,
  ContextPickerTrigger,
  ContextSearch,
  Icon,
  SourceMark,
  type ContextSearchOption,
} from '@devhub/ui';
import { matchesWords } from '../../../words/match-words.ts';
import { useSearchIndex } from '../../search/queries.ts';
import { FolderDialog } from '../../settings/components/folder-dialog.tsx';
import { useRepositories } from '../../settings/queries.ts';
import { chipFromPaste, fileChipFrom, firstTicket, folderFor, refusalFor } from '../composer-rules.ts';
import { addRow, composerWords, countOf, fileRefusedLine, refusedLine } from '../composer-words.ts';
import { useComposerStore } from '../store.ts';

const words = composerWords.kinds;
type ListKind = 'repository' | 'jira' | 'pull_request';
const jiraKey = /^[A-Z][A-Z0-9_]{0,99}-[1-9]\d{0,9}$/;

/** A list's head and foot, as each kind words them. */
const lists = {
  repository: words.repository,
  jira: words.jira,
  pull_request: words.pullRequest,
} as const;

/** What a list shows in place of options while its tool isn't ready (Q15a). */
function toolNotice(state: InboxToolState | undefined, notConnected: string) {
  if (state?.state !== 'not_connected') return undefined;
  return (
    <Link to="/settings/$tab" params={{ tab: 'connections' }} className="text-info underline">
      {notConnected}
    </Link>
  );
}

interface ListProps {
  query: string;
  onQueryChange: (query: string) => void;
  onBack: () => void;
  onPicked: () => void;
  onAddFolder: () => void;
}

/** The Jira ticket and Pull request lists, from what search already holds (009); typing never asks again. */
function ToolList({ kind, query, onQueryChange, onBack, onPicked }: ListProps & { kind: 'jira' | 'pull_request' }) {
  const index = useSearchIndex();
  const chips = useComposerStore((state) => state.chips);
  const addChip = useComposerStore((state) => state.addChip);
  const said = lists[kind];
  const tool = index.data?.tools[kind === 'jira' ? 'jira' : 'github'];
  const loading = index.data === undefined || tool?.state === 'syncing';

  const known: (ContextSearchOption & { chip: ComposerChip; words: string })[] =
    kind === 'jira'
      ? (index.data?.tickets ?? []).map((ticket) => ({
          value: ticket.key,
          label: ticket.key,
          description: `${ticket.title} · ${ticket.status}`,
          mark: <SourceMark source="jira" label="none" />,
          added: chips.some((chip) => chip.kind === 'jira' && chip.key === ticket.key),
          chip: { kind: 'jira', key: ticket.key },
          words: `${ticket.key} ${ticket.title}`,
        }))
      : (index.data?.pullRequests ?? []).flatMap((pull) => {
          const chip = chipFromPaste(pull.url);
          if (chip?.kind !== 'pull_request') return [];
          return [
            {
              value: pull.id,
              label: `${pull.repository} #${String(pull.number)}`,
              description: pull.author === null ? pull.title : `${pull.title} · ${pull.author}`,
              mark: <SourceMark source="github" label="none" />,
              added: chips.some(
                (held) =>
                  held.kind === 'pull_request' &&
                  `${held.owner}/${held.name}#${String(held.number)}`.toLowerCase() === pull.id.toLowerCase(),
              ),
              chip,
              words: `${pull.id} ${pull.repository} ${String(pull.number)} ${pull.title}`,
            },
          ];
        });
  const shown = known.filter((option) => matchesWords(option.words, query));

  // A key or a link the list doesn't hold can still be added; Jira or GitHub checks it at Send (AC-10).
  const typed = query.trim();
  const extraChip: ComposerChip | null =
    kind === 'jira'
      ? jiraKey.test(typed.toUpperCase())
        ? { kind: 'jira', key: typed.toUpperCase() }
        : null
      : (() => {
          const chip = chipFromPaste(typed);
          return chip?.kind === 'pull_request' ? chip : null;
        })();
  const typedOption =
    extraChip === null || known.some((option) => JSON.stringify(option.chip) === JSON.stringify(extraChip))
      ? []
      : [
          {
            value: `add:${typed}`,
            label: addRow(extraChip.kind === 'jira' ? extraChip.key : `${extraChip.name} #${String(extraChip.number)}`),
            chip: extraChip,
          },
        ];
  const options = [...typedOption, ...shown];
  // A kind that's full says so in place of its list (spec 022, Q5).
  const refusal = refusalFor(chips, kind);
  const full = refusal === null ? undefined : refusedLine(refusal);

  return (
    <ContextSearch
      title={said.title}
      count={loading || tool?.state === 'not_connected' ? undefined : countOf(kind, known.length)}
      onBack={onBack}
      searchLabel={said.search}
      query={query}
      onQueryChange={onQueryChange}
      options={options}
      onPick={(value) => {
        const option = options.find((candidate) => candidate.value === value);
        if (option === undefined) return;
        if (addChip(option.chip) === null) onPicked();
      }}
      emptyText={query.trim() === '' ? said.empty : composerWords.noMatches}
      loading={loading}
      notice={full ?? toolNotice(tool, said.notConnected)}
      note={said.note}
    />
  );
}

/** The folders, from Settings › Repositories; picking one sets the folder picker, not a chip (AC-13). */
function FolderList({ query, onQueryChange, onBack, onPicked, onAddFolder }: ListProps) {
  const repositories = useRepositories();
  const chips = useComposerStore((state) => state.chips);
  const picked = useComposerStore((state) => state.picked);
  const lastUsed = useComposerStore((state) => state.lastUsed);
  const pickFolder = useComposerStore((state) => state.pickFolder);
  const folders = repositories.data?.repositories ?? [];
  const ticketKey = firstTicket(chips);
  const shownFolder = folderFor({ folders, picked, ticketKey, lastUsed });
  const options = folders
    .filter((folder) => matchesWords(`${folder.name} ${folder.displayPath}`, query))
    .map((folder) => ({
      value: folder.id,
      label: folder.name,
      description: folder.displayPath,
      mark: <Icon icon={Folder01Icon} className="text-muted-foreground" />,
      added: shownFolder.kind === 'folder' && shownFolder.folder.id === folder.id,
    }));
  return (
    <ContextSearch
      title={words.repository.title}
      count={repositories.data === undefined ? undefined : countOf('repository', folders.length)}
      onBack={onBack}
      searchLabel={words.repository.search}
      query={query}
      onQueryChange={onQueryChange}
      options={options}
      onPick={(id) => {
        pickFolder(id);
        onPicked();
      }}
      emptyText={folders.length === 0 ? words.repository.empty : composerWords.noMatches}
      loading={repositories.data === undefined}
      extra={{ label: words.repository.add, icon: <Icon icon={PlusSignIcon} />, onSelect: onAddFolder }}
      note={words.repository.note}
    />
  );
}

/**
 * The composer's + (spec 015, AC-6 to AC-13): the kinds of context, then one kind's list in the same popup. A
 * ticket or pull request becomes a chip, a folder sets the folder picker, and a file opens the computer's own file
 * dialog. A pick closes the popup and puts focus back in the box (`onPicked`); a file that can't be added is said
 * under the composer (`onRefused`).
 */
export function AddContext({
  onPicked,
  onRefused,
}: {
  onPicked: () => void;
  onRefused: (line: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'kinds' | ListKind>('kinds');
  const [query, setQuery] = useState('');
  const [addingFolder, setAddingFolder] = useState(false);
  const pickFolder = useComposerStore((state) => state.pickFolder);
  const addChip = useComposerStore((state) => state.addChip);
  const files = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // Set by a pick, so closing puts focus in the box (AC-8); Esc leaves it on +.
  const toBox = useRef(false);
  const toFolderDialog = useRef(false);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) return;
    setView('kinds');
    setQuery('');
  }

  function openList(kind: ListKind) {
    setQuery('');
    setView(kind);
  }

  function picked() {
    toBox.current = true;
    setOpen(false);
  }

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const chosen = [...(event.target.files ?? [])];
    // The same file can be picked again later.
    event.target.value = '';
    onRefused(null);
    for (const file of chosen) {
      const chip = fileChipFrom(file.name, new Uint8Array(await file.arrayBuffer()));
      if (chip.kind !== 'file') {
        onRefused(fileRefusedLine(chip));
        continue;
      }
      if (addChip(chip) !== null) {
        onRefused(fileRefusedLine({ kind: 'too_many' }));
        return;
      }
    }
    onPicked();
  }

  const listProps: ListProps = {
    query,
    onQueryChange: setQuery,
    onBack: () => {
      setView('kinds');
    },
    onPicked: picked,
    onAddFolder: () => {
      toFolderDialog.current = true;
      setOpen(false);
    },
  };

  return (
    <>
      <ContextPicker open={open} onOpenChange={changeOpen}>
        <ContextPickerTrigger ref={trigger} label={words.label} />
        <ContextPickerContent
          view={view === 'kinds' ? 'kinds' : 'list'}
          aria-label={view === 'kinds' ? words.label : lists[view].title}
          foot={words.foot}
          onCloseAutoFocus={(event) => {
            if (toFolderDialog.current) {
              toFolderDialog.current = false;
              event.preventDefault();
              setAddingFolder(true);
              return;
            }
            if (!toBox.current) return;
            toBox.current = false;
            event.preventDefault();
            onPicked();
          }}
        >
          {view === 'kinds' ? (
            <>
              <ContextPickerLabel>{words.heading}</ContextPickerLabel>
              <ContextKindItem
                icon={<Icon icon={GitBranchIcon} className="text-muted-foreground" />}
                description={words.repository.description}
                leadsOn
                onSelect={() => {
                  openList('repository');
                }}
              >
                {words.repository.title}
              </ContextKindItem>
              <ContextKindItem
                icon={<SourceMark source="jira" label="none" />}
                description={words.jira.description}
                leadsOn
                onSelect={() => {
                  openList('jira');
                }}
              >
                {words.jira.title}
              </ContextKindItem>
              <ContextKindItem
                icon={<SourceMark source="github" label="none" />}
                description={words.pullRequest.description}
                leadsOn
                onSelect={() => {
                  openList('pull_request');
                }}
              >
                {words.pullRequest.title}
              </ContextKindItem>
              <ContextKindItem
                icon={<Icon icon={File01Icon} className="text-muted-foreground" />}
                description={words.file.description}
                onSelect={() => {
                  setOpen(false);
                  // The computer's own file dialog, from this click (Q5).
                  files.current?.click();
                }}
              >
                {words.file.title}
              </ContextKindItem>
            </>
          ) : view === 'repository' ? (
            <FolderList {...listProps} />
          ) : (
            <ToolList kind={view} {...listProps} />
          )}
        </ContextPickerContent>
      </ContextPicker>
      <input
        ref={files}
        type="file"
        multiple
        tabIndex={-1}
        aria-label={words.file.title}
        className="sr-only"
        onChange={(event) => void addFiles(event)}
      />
      <FolderDialog
        task={addingFolder ? { kind: 'add' } : null}
        returnFocusTo={() => trigger.current}
        onClose={() => {
          setAddingFolder(false);
        }}
        onSaved={(folder) => {
          setAddingFolder(false);
          pickFolder(folder.id);
        }}
      />
    </>
  );
}
