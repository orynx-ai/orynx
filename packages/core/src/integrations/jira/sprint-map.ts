import { z } from 'zod';
import {
  JiraProjectKeySchema,
  SprintSchema,
  type OpenSprint,
  TicketSchema,
  type PriorityLevel,
  type Sprint,
  type TicketColumn,
} from '@devhub/contracts';
import type { JiraBoardColumn, JiraBoardSprint, JiraSprintIssue, JiraSprintRef } from './client.ts';
import { isoTime } from './map.ts';

/**
 * Tickets' sprint (spec 008) as the cache keeps it: titles and metadata only, never a description or a
 * comment. Each ticket's session and link are added when Tickets reads: the link from the saved site, so a
 * cache someone else wrote can't point a title anywhere else.
 */
export const TicketRecordSchema = TicketSchema.omit({ session: true, url: true });
export type TicketRecord = z.infer<typeof TicketRecordSchema>;

export const SprintRecordSchema = z.object({
  /** Null for No sprint, whose tickets come without one (spec 020). */
  sprint: SprintSchema.nullable(),
  tickets: z.array(TicketRecordSchema),
  truncated: z.boolean(),
});
export type SprintRecord = z.infer<typeof SprintRecordSchema>;

// A key that is safe to put in a link: project letters, a dash and a number.
const issueKey = /^[A-Z][A-Z0-9_]*-\d+$/;

/** When two sprints tie, the one with no end date comes last. */
function endsAt(sprint: JiraSprintRef): number {
  const at = sprint.endDate === null ? Number.NaN : Date.parse(sprint.endDate);
  return Number.isNaN(at) ? Number.POSITIVE_INFINITY : at;
}

/**
 * Q1: the active sprint that holds the most of your issues; on a tie, the one that ends first. Future and
 * closed sprints never count, though `openSprints()` and the sprint field bring them along.
 */
export function pickSprint(
  issues: readonly { key: string; sprints: readonly JiraSprintRef[] }[],
): JiraSprintRef | null {
  const counted = new Map<number, { sprint: JiraSprintRef; issues: number }>();
  for (const { sprints } of issues) {
    for (const sprint of new Map(sprints.map((held) => [held.id, held])).values()) {
      if (sprint.state !== 'active') continue;
      const seen = counted.get(sprint.id);
      counted.set(sprint.id, { sprint, issues: (seen?.issues ?? 0) + 1 });
    }
  }
  const [best] = [...counted.values()].sort(
    (a, b) => b.issues - a.issues || endsAt(a.sprint) - endsAt(b.sprint) || a.sprint.id - b.sprint.id,
  );
  return best?.sprint ?? null;
}

/** Where each status sits on the sprint's board, and the first column holding an In progress status. */
export interface BoardLayout {
  columnOfStatus: ReadonlyMap<string, number>;
  firstInProgress: number | null;
}

/**
 * The board's columns with each status's category (Jira's `new`, `indeterminate` or `done`), by status id.
 * The board names columns as the team likes; DevHub reads only their order and their statuses.
 */
export function boardLayout(columns: readonly JiraBoardColumn[], categories: ReadonlyMap<string, string>): BoardLayout {
  const columnOfStatus = new Map<string, number>();
  columns.forEach((column, index) => {
    for (const id of column.statusIds) if (!columnOfStatus.has(id)) columnOfStatus.set(id, index);
  });
  const first = columns.findIndex((column) => column.statusIds.some((id) => categories.get(id) === 'indeterminate'));
  return { columnOfStatus, firstInProgress: first === -1 ? null : first };
}

/**
 * Q2: To do and Done follow the status category. An In progress status sits in In review when the board
 * puts it in a later column than the first one holding an In progress status. Never by name.
 */
export function columnOf(status: { id: string; category: string }, layout: BoardLayout | null): TicketColumn {
  if (status.category === 'done') return 'done';
  if (status.category !== 'indeterminate') return 'to_do';
  const first = layout?.firstInProgress ?? null;
  const column = layout?.columnOfStatus.get(status.id);
  return first !== null && column !== undefined && column > first ? 'in_review' : 'in_progress';
}

/**
 * Q7a: the bars from the site's priority order, highest first. The two highest get 3 and the two lowest 1;
 * with three or fewer, only the highest gets 3 and only the lowest 1. A priority the site no longer lists
 * gets 2.
 */
export function priorityLevel(id: string, order: readonly string[]): PriorityLevel {
  const at = order.indexOf(id);
  if (at === -1) return 'medium';
  const ends = order.length > 3 ? 2 : 1;
  if (at < ends) return 'high';
  if (at >= order.length - ends) return 'low';
  return 'medium';
}

/** Q9a: the project the sprint's tickets belong to, or null when they span more than one, or there are none. */
function projectOf(keys: readonly string[]): string | null {
  const projects = new Set(keys.map((key) => key.slice(0, key.lastIndexOf('-'))));
  const [only] = projects;
  return projects.size === 1 && only !== undefined && JiraProjectKeySchema.safeParse(only).success ? only : null;
}

export interface SprintRecordInput {
  /** Who the saved credentials belong to, for "Assigned to you". */
  accountId: string;
  /** Null for No sprint (spec 020). */
  sprint: JiraSprintRef | null;
  /** The sprint's issues in rank order. */
  issues: readonly JiraSprintIssue[];
  /** Null when the board is gone or hidden: every In progress ticket is then In progress (AC-5). */
  layout: BoardLayout | null;
  priorityOrder: readonly string[];
  truncated: boolean;
}

/**
 * The sprint and its tickets, in Jira's rank order, as the cache keeps them. A key that can't make a safe
 * link, a key's second copy and an issue with no type are left out. Only the fields named here are copied,
 * so a description or a comment that came along never reaches the cache.
 */
export function sprintRecord(input: SprintRecordInput): SprintRecord {
  const seen = new Set<string>();
  const tickets = input.issues.flatMap(({ key, fields }): TicketRecord[] => {
    if (seen.has(key) || !issueKey.test(key)) return [];
    seen.add(key);
    const type = fields.issuetype?.name.trim() ?? '';
    if (type === '') return [];
    const summary = fields.summary?.trim() ?? '';
    const dueDate = z.iso.date().safeParse(fields.duedate);
    const assignee = fields.assignee?.displayName?.trim() ?? '';
    return [
      {
        key,
        title: summary === '' ? key : summary,
        status: fields.status.name,
        column: columnOf({ id: fields.status.id, category: fields.status.statusCategory.key }, input.layout),
        type,
        bug: type.toLowerCase() === 'bug',
        priority: fields.priority
          ? { name: fields.priority.name, level: priorityLevel(fields.priority.id, input.priorityOrder) }
          : null,
        dueDate: dueDate.success ? dueDate.data : null,
        assignee:
          fields.assignee && assignee !== ''
            ? { name: assignee, mine: fields.assignee.accountId === input.accountId }
            : null,
      },
    ];
  });
  const sprint: Sprint | null =
    input.sprint === null
      ? null
      : {
          id: input.sprint.id,
          name: input.sprint.name,
          endsAt: isoTime(input.sprint.endDate),
          projectKey: projectOf(tickets.map((ticket) => ticket.key)),
        };
  return { sprint, tickets, truncated: input.truncated };
}

/** A project's open sprint as Tickets' Sprint menu lists it (spec 020); a closed one is left out. */
export function openSprintOf(sprint: JiraBoardSprint): OpenSprint | null {
  if (sprint.state === 'closed') return null;
  return {
    id: sprint.id,
    name: sprint.name,
    state: sprint.state,
    startsAt: isoTime(sprint.startDate),
    endsAt: isoTime(sprint.endDate),
  };
}
