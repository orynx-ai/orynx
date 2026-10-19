import {
  composerLimits,
  type CannotStartReason,
  type ComposerChip,
  type ContextProblem,
  type SessionApproval,
} from '@devhub/contracts';
import type { ChipRefusal } from './composer-rules.ts';

/**
 * Home's composer in words (spec 015, Q13): the box, the + menu and its lists, the pickers, what Send says when it
 * starts nothing, and the waiting banner.
 */

/** A Settings tab a line links to. */
export interface SettingsLink {
  label: string;
  tab: 'coding-agent' | 'repositories' | 'connections';
}

export const composerWords = {
  label: 'Describe a task for Claude',
  send: 'Send to Claude',
  sending: 'Sending to Claude',
  contextList: 'Context for Claude',
  remove: (label: string) => `Remove ${label}`,
  kinds: {
    label: 'Add context',
    heading: 'Add context for Claude',
    foot: 'Tip: you can also paste a Jira key or a pull request link into the box.',
    repository: {
      title: 'Git repository',
      description: 'The folder Claude works in',
      search: 'Search folders',
      note: 'Claude works on a new branch in a worktree of this folder.',
      empty: 'No folders yet.',
      add: 'Add local folder…',
    },
    jira: {
      title: 'Jira ticket',
      description: 'Search by key or title',
      search: 'Search tickets by key or title',
      note: 'Claude gets the summary, description, comments and linked issues.',
      empty: 'No open tickets assigned to you. Type a key to add one.',
      notConnected: 'Connect Jira in Settings to add tickets.',
    },
    pullRequest: {
      title: 'Pull request',
      description: 'Search by repo, number or title',
      search: 'Search pull requests by repo, number or title',
      note: 'Claude gets the description, the diff, failing checks and open review comments.',
      empty: 'No open pull requests of yours or waiting for your review. Paste a link to add one.',
      notConnected: 'Connect GitHub in Settings to add pull requests.',
    },
    file: { title: 'File from this computer', description: 'Any file. Claude reads it where it is.' },
  },
  noMatches: 'No matches. Try a key like PROJ-1423 or a repo name.',
  folder: {
    menu: 'Repository',
    section: 'On this computer',
    add: 'Add local folder',
    manage: 'Manage folders',
    none: 'Add a folder',
    choose: 'Choose folder',
    name: (folder: string) => `Repository: ${folder}`,
  },
  agent: {
    menu: 'Agent',
    name: 'Claude',
    connected: 'Connected · runs locally',
    signedOut: 'Signed out',
    settings: 'Open Settings › Coding agent',
    label: (connected: boolean) => `Agent: Claude, ${connected ? 'connected' : 'signed out'}`,
  },
  existing: (key: string) => `${key} already has a session.`,
  openSession: 'Open session',
  failed: "Couldn't start Claude. Try again.",
  tooLong: 'Keep it under 10,000 characters.',
  quickStarts: { label: 'Quick starts', ticket: 'Pick up a ticket', review: 'Review a pull request' },
  /** A Home row's + (spec 022, Q3, Q12): its tooltip, its name for the chip it adds, and what a screen reader hears. */
  row: {
    add: 'Add to composer',
    remove: 'Remove from composer',
    addName: (label: string) => `Add ${label} to the composer`,
    removeName: (label: string) => `Remove ${label} from the composer`,
    added: (label: string) => `${label} added to the composer.`,
    removed: (label: string) => `${label} removed from the composer.`,
  },
  /** The `/` list of skills (spec 022, G, Q12). */
  skills: {
    label: 'Skills',
    yours: 'Yours',
    /** A skill you wrote in Settings › Skills (spec 023). */
    orynx: 'Orynx',
    empty: (folder: string | null) =>
      folder === null ? 'No skills in ~/.claude.' : `No skills in ${folder} or in ~/.claude.`,
    failed: "Orynx couldn't read the skills.",
    tooMany: 'Use up to 5 skills.',
  },
  /** The +N after the first two chips (spec 022, Q6). */
  more: {
    tooltip: 'Show all context',
    label: (count: number) => `Show all ${String(count)} ${count === 1 ? 'item' : 'items'} of context`,
  },
  /** The dialog +N opens (spec 022, Q7, Q12). */
  dialog: {
    title: 'Context for Claude',
    tabs: { tickets: 'Tickets', pull_requests: 'Pull requests', files: 'Files' },
    empty: { tickets: 'No tickets added.', pull_requests: 'No pull requests added.', files: 'No files added.' },
    remove: 'Remove',
    done: 'Done',
  },
  banner: { title: 'Claude is waiting for your approval', action: 'Review' },
} as const;

/** Why a chip of a full kind wasn't added (spec 022, Q5, Q12). */
export function refusedLine(refusal: ChipRefusal): string {
  switch (refusal) {
    case 'too_many_tickets':
      return `A session takes up to ${String(composerLimits.tickets)} tickets.`;
    case 'too_many_pull_requests':
      return `A session takes up to ${String(composerLimits.pullRequests)} pull requests.`;
    case 'too_many_files':
      return `Add up to ${String(composerLimits.files)} files.`;
  }
}

/** AC-3, AC-8: with a ticket added, Send works with the box empty, and the box says so; with several, how many (022 Q12). */
export function placeholderFor(ticketKeys: readonly string[]): string {
  const [first] = ticketKeys;
  if (first === undefined) return 'Describe a task, or paste a Jira key like PROJ-1423';
  if (ticketKeys.length === 1) return `What should Claude do with ${first}?`;
  return `What should Claude do with these ${String(ticketKeys.length)} tickets?`;
}

/** A file's name longer than this is cut in the middle, so its extension still shows (Q15d). */
const mostFileNameCharacters = 28;

/** `release-notes-for-the-people-directory.md` → `release-notes-f…directory.md`. */
export function shortFileName(name: string): string {
  if (name.length <= mostFileNameCharacters) return name;
  // The last 12 characters keep the extension and a little of the name before it.
  const tail = 12;
  return `${name.slice(0, mostFileNameCharacters - tail - 1)}…${name.slice(-tail)}`;
}

/** A path's last part, its file's name: `~/notes/plan.pdf` → `plan.pdf`. */
export function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** How a chip reads: `PROJ-1423`, `web-app #2836`, `plan.pdf` (cut in the middle when long). */
export function chipLabel(chip: ComposerChip): string {
  switch (chip.kind) {
    case 'jira':
      return chip.key;
    case 'pull_request':
      return `${chip.name} #${String(chip.number)}`;
    case 'file':
      return shortFileName(fileName(chip.path));
  }
}

/** Said to screen readers when a chip's × takes it away (AC-15). */
export function removedLine(label: string): string {
  return `${label} removed`;
}

/** The count at a list's head. */
export function countOf(kind: 'jira' | 'pull_request' | 'repository', count: number): string {
  if (kind !== 'repository') return `${String(count)} open`;
  return `${String(count)} ${count === 1 ? 'folder' : 'folders'}`;
}

/** The row that adds a key or a pull request the list doesn't hold (AC-10). */
export function addRow(label: string): string {
  return `Add ${label}`;
}

/** Why a file wasn't added (spec 022, Q4, Q12): its name looks like a secret, or there are 20 already. */
export type FileRefusal = { kind: 'secret'; name: string } | { kind: 'too_many' };

export function fileRefusedLine(refusal: FileRefusal): string {
  switch (refusal.kind) {
    case 'secret':
      return `${refusal.name} looks like a secret, so Claude doesn't get it.`;
    case 'too_many':
      return refusedLine('too_many_files');
  }
}

/** Add a file, when no picker can open (spec 022, AC-12, Q12). */
export const addFileWords = {
  title: 'Add a file',
  path: 'Path',
  help: "The file's full path, for example ~/notes/plan.pdf.",
  notAPath: "Type the file's full path, from / or ~/.",
  add: 'Add',
  cancel: 'Cancel',
  notFound: (path: string) => `Orynx can't find ${path}.`,
} as const;

/** Why Send started nothing (011 Q4, as Ship says it), and the Settings tab that fixes it. */
export function cannotStartLine(reason: CannotStartReason): { line: string; link: SettingsLink | null } {
  switch (reason) {
    case 'signed_out':
      return {
        line: "Claude Code isn't signed in.",
        link: { label: composerWords.agent.settings, tab: 'coding-agent' },
      };
    case 'too_many':
      return { line: 'Three sessions are already working. Stop one to start another.', link: null };
    case 'no_folder':
      return {
        line: 'Add a folder for Claude to work in.',
        link: { label: 'Open Settings › Repositories', tab: 'repositories' },
      };
    case 'choose_folder':
      return { line: 'Choose a folder for Claude to work in.', link: null };
  }
}

/** AC-21: the chip Jira or GitHub couldn't give, and what to do. */
export function contextFailedLine(
  chip: ComposerChip,
  problem: ContextProblem,
): { line: string; link: SettingsLink | null } {
  // A file is checked on this computer, and only for being there (spec 022, AC-16).
  if (chip.kind === 'file') return { line: addFileWords.notFound(chip.path), link: null };
  const jira = chip.kind === 'jira';
  const tool = jira ? 'Jira' : 'GitHub';
  const name = chip.kind === 'jira' ? chip.key : `${chip.owner}/${chip.name} #${String(chip.number)}`;
  switch (problem) {
    case 'not_found':
      return { line: `${tool} can't find ${name}, or you can't see it.`, link: null };
    case 'unreachable':
      return { line: `${tool} didn't answer. Try again.`, link: null };
    case 'not_connected':
      return {
        line: jira ? composerWords.kinds.jira.notConnected : composerWords.kinds.pullRequest.notConnected,
        link: { label: 'Open Settings › Connections', tab: 'connections' },
      };
    case 'other':
      return { line: `${tool} couldn't give ${name}. Try again.`, link: null };
  }
}

/** The banner's second line (AC-25, AC-26): `PROJ-1423 · Add bulk archive · wants to run npm test · 2 more waiting`. */
export function bannerDetail({
  key,
  title,
  approval,
  more,
}: {
  key: string | null;
  title: string;
  approval: SessionApproval | null;
  more: number;
}): string {
  const parts = key === null ? [title] : [key, title];
  if (approval !== null) {
    parts.push(approval.kind === 'command' ? `wants to run ${approval.command}` : `wants to edit ${approval.path}`);
  }
  if (more > 0) parts.push(`${String(more)} more waiting`);
  return parts.join(' · ');
}
