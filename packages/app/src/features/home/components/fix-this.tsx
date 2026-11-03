import { useRef, useState } from 'react';
import { Wrench01Icon } from '@hugeicons/core-free-icons';
import { useNavigate } from '@tanstack/react-router';
import type { ComposerChip, ComposerStart, InboxItem } from '@devhub/contracts';
import { Icon, IconButton } from '@devhub/ui';
import { useRepositories, useStatus } from '../../settings/queries.ts';
import { NewTicketDialog, type JiraTarget } from '../../tickets/components/new-ticket.tsx';
import { useTicketsSprints } from '../../tickets/queries.ts';
import { folderFor } from '../composer-rules.ts';
import { useStartFromComposer } from '../queries.ts';
import { useComposerStore } from '../store.ts';
import { useAgentChoice } from './agent-picker.tsx';

/** Who reported it and where, then the link, as the new ticket's description says it (spec 016, D). */
function reportedBy(item: InboxItem): string {
  if (item.subject.kind !== 'message' || item.target.kind !== 'external') return item.title;
  const { from, channel } = item.subject;
  const where = channel === null ? 'a direct message' : `#${channel}`;
  return `Reported by ${from} in ${where}: ${item.target.url}\n\n${item.title}`;
}

/**
 * Fix this on a Slack or Discord row (spec 016, D): the New ticket dialog, filled in as a Bug, on the Jira project
 * of the composer's folder in its one active sprint, or on Orynx. Once the ticket is made, a Build starts on it with
 * the thread as context, the composer's model and effort, and opens. What stops it is said under the composer, with
 * the ticket and the thread put in it as Build, as Fix does (spec 047); the draft stays as it was.
 */
export function FixThis({ item, thread }: { item: InboxItem; thread: ComposerChip }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const navigate = useNavigate();
  const start = useStartFromComposer();
  const model = useComposerStore((state) => state.model);
  const effort = useComposerStore((state) => state.effort);
  const choice = useAgentChoice(model, effort);
  const picked = useComposerStore((state) => state.picked);
  const lastUsed = useComposerStore((state) => state.lastUsed);
  const addChip = useComposerStore((state) => state.addChip);
  const setMode = useComposerStore((state) => state.setMode);
  const setTried = useComposerStore((state) => state.setTried);
  const jiraConnected = useStatus().data?.integrations.jira.state === 'connected';
  const shown = folderFor({
    folders: useRepositories().data?.repositories ?? [],
    picked,
    ticketKey: null,
    lastUsed,
  });
  const folder = shown.kind === 'folder' ? shown.folder : null;
  const project = jiraConnected ? (folder?.jiraProject ?? null) : null;
  const sprints = useTicketsSprints(project, open).data?.sprints.filter((sprint) => sprint.state === 'active') ?? [];
  const [active] = sprints;
  // Its one active sprint, else none: the backlog (Q9).
  const target: JiraTarget | null =
    project === null
      ? null
      : { project, sprint: sprints.length === 1 && active ? { id: active.id, name: active.name } : null };

  function close() {
    setOpen(false);
    // Nothing else opened the dialog, so focus comes back here by hand (AC-39).
    setTimeout(() => button.current?.focus(), 0);
  }

  function build(key: string) {
    const context: ComposerChip[] = [{ kind: 'jira', key }, thread];
    const request: ComposerStart = {
      message: '',
      context,
      ...choice,
      mode: 'build',
      ...(folder === null ? {} : { repositoryId: folder.id }),
    };
    start.mutate(request, {
      onSuccess: (answer) => {
        if (answer.result === 'started') {
          setTried(null);
          void navigate({ to: '/sessions/$sessionId', params: { sessionId: answer.sessionId } });
          return;
        }
        // The ticket stays made: it and the thread wait in the composer, and Send's line says why (AC-38).
        for (const chip of context) addChip(chip);
        setMode('build');
        setTried({ request, answer, draft: false });
      },
      onError: () => {
        setTried({ request, answer: 'failed', draft: false });
      },
    });
  }

  return (
    <>
      <IconButton
        ref={button}
        variant="ghost"
        size="sm"
        label="Fix this"
        aria-label={`Fix this: ${item.title}`}
        disabled={start.isPending}
        onClick={() => {
          setOpen(true);
        }}
      >
        <Icon icon={Wrench01Icon} aria-hidden />
      </IconButton>
      <NewTicketDialog
        jira={target !== null}
        target={target}
        opened={{ column: open ? 'to_do' : null, close }}
        prefill={{ title: item.title, description: reportedBy(item) }}
        onMade={build}
      />
    </>
  );
}
