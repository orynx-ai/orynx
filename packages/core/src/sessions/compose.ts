import type { ComposerStart, Repository, SessionActivity } from '@devhub/contracts';
import type { AgentBrief, AgentReads } from '../agents/agent-adapter.ts';
import { composerBrief, ticketBrief, type BriefChip, type BriefTicket } from './brief.ts';
import { branchSlug, titleFrom } from './composer-names.ts';
import type { JiraIssueDetail } from '../integrations/jira/client.ts';

/**
 * How a session's run starts once its record is made (spec 015): the brief Claude gets, the name its branch
 * starts from, the brief step, and whether Claude's note points it at the ticket. Ship builds one from the
 * ticket (spec 011); the composer builds one from what it read before the record was made.
 */
export interface StartPlan {
  brief: AgentBrief;
  /** `PROJ-1423` or a slug; the branch is `feat/<name>`, then `-2`, `-3` (spec 011). */
  branchName: string;
  briefStep: Omit<Extract<SessionActivity, { kind: 'brief' }>, 'id' | 'state' | 'kind'>;
  /** True when the ticket alone is the brief, so the note says "Make the change the ticket asks for." */
  ticketNote: boolean;
  /** What outside the worktree Claude may read: the files you picked, skills' folders (spec 022). */
  reads: AgentReads;
}

/** Nothing outside the worktree, as for Ship's start. */
export const noReads: AgentReads = { files: [], folders: [] };

/** Ship's plan: the ticket is the brief (spec 011, Q5). */
export function ticketPlan(issue: JiraIssueDetail): StartPlan {
  return {
    brief: ticketBrief(issue),
    branchName: issue.key,
    briefStep: { key: issue.key, tickets: [], message: false, pullRequests: [], files: [] },
    ticketNote: true,
    reads: noReads,
  };
}

function projectOf(key: string): string {
  return key.slice(0, key.lastIndexOf('-'));
}

/** The session's own ticket: the first the composer added (spec 022, Q2). The others are context only. */
export function ticketKeyOf(request: ComposerStart): string | null {
  return request.context.find((chip) => chip.kind === 'jira')?.key ?? null;
}

/**
 * The folder a composer start works in (Q7): the one the page sent, else the ticket's project's only folder,
 * else the only folder there is. The page sends the folder it shows, so the rest is for a page that couldn't.
 */
export function chooseFolder(
  folders: readonly Repository[],
  request: ComposerStart,
): Repository | 'no_folder' | 'choose_folder' {
  if (folders.length === 0) return 'no_folder';
  if (request.repositoryId !== undefined) {
    return folders.find((folder) => folder.id === request.repositoryId) ?? 'choose_folder';
  }
  const key = ticketKeyOf(request);
  const candidates = key === null ? folders : folders.filter((folder) => folder.jiraProject === projectOf(key));
  return candidates.length === 1 && candidates[0] !== undefined ? candidates[0] : 'choose_folder';
}

/** What a composer start makes from your message and the chips as read (Q8). */
export interface ComposerPlan {
  title: string;
  /** The first ticket chip as read, for the session's source, title and Ticket tab; null without one (spec 022, Q2). */
  ticket: BriefTicket | null;
  plan: StartPlan;
}

export function composerPlan(message: string, chips: readonly BriefChip[]): ComposerPlan {
  const ticket = chips.find((chip) => chip.kind === 'jira') ?? null;
  const title = ticket === null || ticket.summary.trim() === '' ? titleFrom(message) : ticket.summary;
  return {
    title: title === '' && ticket !== null ? ticket.key : title,
    ticket,
    plan: {
      brief: composerBrief(message, chips),
      branchName: ticket === null ? branchSlug(title) : ticket.key,
      briefStep: {
        key: ticket?.key ?? null,
        tickets: chips.flatMap((chip) => (chip.kind === 'jira' && chip !== ticket ? [chip.key] : [])),
        message: message !== '',
        pullRequests: chips.flatMap((chip) =>
          chip.kind === 'pull_request' ? [`${chip.name} #${String(chip.number)}`] : [],
        ),
        files: chips.flatMap((chip) => (chip.kind === 'file' ? [chip.path] : [])),
      },
      ticketNote: ticket !== null && message === '',
      reads: { files: chips.flatMap((chip) => (chip.kind === 'file' ? [chip.real] : [])), folders: [] },
    },
  };
}
