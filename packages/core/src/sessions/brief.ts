import { isOrynxKey, type Permissions } from '@devhub/contracts';
import type { AgentBrief } from '../agents/agent-adapter.ts';
import type { JiraIssueDetail } from '../integrations/jira/client.ts';

/**
 * What Claude is sent when a session starts (spec 011, Q5). Until the composer arrives (015), the brief is
 * the ticket alone: one context chip and no message. The same text is saved as the session's `brief.md`,
 * so you can read exactly what Claude got.
 */
export function ticketBrief(issue: JiraIssueDetail): AgentBrief {
  return {
    message: '',
    context: [{ kind: 'jira', title: ticketTitle(issue), body: issue.description ?? 'No description.' }],
  };
}

/** A ticket as the composer's brief gives it (spec 015, Q3): 011's fields, its last comments and its links. */
export interface BriefTicket extends JiraIssueDetail {
  /** One of Orynx's own tickets (spec 037): its priority, status and due day, which go before its description. */
  facts?: readonly string[];
  /** Oldest first; Orynx reads at most the last 20. `created` is Jira's own time, of which the day is shown. */
  comments: readonly { author: string; created: string; body: string }[];
  /** `relation` is Jira's own words for the link from this ticket ("blocks", "is cloned by"). */
  links: readonly { relation: string; key: string; summary: string; status: string | null }[];
}

/** A changed file with its counts, for a diff that isn't sent whole. */
export interface BriefFileCount {
  path: string;
  additions: number;
  deletions: number;
}

/** A pull request as the composer's brief gives it (spec 015, Q4). */
export interface BriefPullRequest {
  owner: string;
  name: string;
  number: number;
  title: string;
  body: string | null;
  base: string;
  head: string;
  failingChecks: readonly { name: string; conclusion: string }[];
  /** The review threads that aren't resolved; `line` is null for a comment on a whole file. */
  comments: readonly { author: string; path: string; line: number | null; body: string }[];
  /** The unified diff, or the files and counts GitHub gave when it found the diff too large. */
  diff: { kind: 'text'; text: string } | { kind: 'too_large'; files: readonly BriefFileCount[] };
  /** Its link and when it opened; whether it's open, from a fork, and yours (spec 031): never put in the brief. */
  url: string;
  openedAt: string;
  open: boolean;
  fork: boolean;
  mine: boolean;
}

/** A file you picked, by its path (spec 022, Q4): as the composer held it, and its real path, which Claude reads. */
export interface BriefFile {
  path: string;
  real: string;
}

/**
 * A skill your message named, as Send read it (spec 022, Q9): its text without the frontmatter, its file's real
 * path, and its folder's, which Claude may read; null for a command, a file on its own.
 */
export interface BriefSkill {
  name: string;
  text: string;
  file: string;
  folder: string | null;
  /** Where it was found; an Orynx skill (spec 023) lives in DEVHUB_HOME, so Claude gets its text and nothing to read. */
  source: 'folder' | 'yours' | 'orynx';
}

/** One chip as the server read it, in the order you added it. */
export type BriefChip =
  ({ kind: 'jira' } & BriefTicket) | ({ kind: 'pull_request' } & BriefPullRequest) | ({ kind: 'file' } & BriefFile);

/** A diff goes to Claude whole up to this many lines, then as counts only (013 Q5, 014 Q4). */
const mostDiffLines = 2000;

function ticketTitle(issue: JiraIssueDetail): string {
  const type = issue.type === null ? '' : ` (${issue.type})`;
  return `${isOrynxKey(issue.key) ? 'Orynx' : 'Jira'} ticket ${issue.key}${type}: ${issue.summary}`;
}

function countsLine(file: BriefFileCount): string {
  return `- ${file.path} (+${String(file.additions)} −${String(file.deletions)})`;
}

/** Each file's added and removed lines, read from a unified diff's `diff --git` sections. */
function countDiff(lines: readonly string[]): BriefFileCount[] {
  const files: BriefFileCount[] = [];
  let current: BriefFileCount | null = null;
  let inHunk = false;
  for (const line of lines) {
    const header = /^diff --git a\/.* b\/(.*)$/.exec(line);
    if (header !== null) {
      current = { path: header[1] ?? '', additions: 0, deletions: 0 };
      files.push(current);
      inHunk = false;
    } else if (current !== null && line.startsWith('@@')) inHunk = true;
    else if (current !== null && inHunk && line.startsWith('+')) current.additions++;
    else if (current !== null && inHunk && line.startsWith('-')) current.deletions++;
  }
  return files;
}

/** The diff as the brief gives it: whole up to 2,000 lines, else those lines and then every file's counts. */
export function diffForBrief(text: string): string {
  const lines = text.split('\n');
  const shown = `\`\`\`diff\n${lines.slice(0, mostDiffLines).join('\n')}\n\`\`\``;
  if (lines.length <= mostDiffLines) return shown;
  const more = lines.length - mostDiffLines;
  const counts = countDiff(lines).map(countsLine).join('\n');
  return `${shown}\n\nThe diff goes on for ${String(more)} more lines. Every changed file:\n${counts}`;
}

function ticketChip(ticket: BriefTicket): AgentBrief['context'][number] {
  const facts = ticket.facts === undefined || ticket.facts.length === 0 ? [] : [ticket.facts.join(' · ')];
  const parts = [...facts, ticket.description ?? 'No description.'];
  if (ticket.comments.length > 0) {
    parts.push('## Comments');
    for (const comment of ticket.comments)
      parts.push(`${comment.author}, ${comment.created.slice(0, 10)}:\n${comment.body}`);
  }
  if (ticket.links.length > 0) {
    const links = ticket.links.map(
      (link) => `- ${link.relation} ${link.key}${link.status === null ? '' : ` (${link.status})`}: ${link.summary}`,
    );
    parts.push('## Linked issues', links.join('\n'));
  }
  return { kind: 'jira', title: ticketTitle(ticket), body: parts.join('\n\n') };
}

function pullRequestChip(pull: BriefPullRequest): AgentBrief['context'][number] {
  const parts = [
    `${pull.head} into ${pull.base}`,
    pull.body === null || pull.body.trim() === '' ? 'No description.' : pull.body,
  ];
  if (pull.failingChecks.length > 0) {
    parts.push(
      '## Failing checks',
      pull.failingChecks.map((check) => `- ${check.name}: ${check.conclusion}`).join('\n'),
    );
  }
  if (pull.comments.length > 0) {
    parts.push('## Unresolved review comments');
    for (const comment of pull.comments) {
      const where = comment.line === null ? comment.path : `${comment.path} line ${String(comment.line)}`;
      parts.push(`${comment.author} on ${where}:\n${comment.body}`);
    }
  }
  parts.push(
    '## Diff',
    pull.diff.kind === 'text'
      ? diffForBrief(pull.diff.text)
      : `GitHub found the diff too large to send. The changed files:\n${pull.diff.files.map(countsLine).join('\n')}`,
  );
  return {
    kind: 'pull_request',
    title: `Pull request ${pull.owner}/${pull.name} #${String(pull.number)}: ${pull.title}`,
    body: parts.join('\n\n'),
  };
}

/**
 * What Claude is sent when a session starts from the composer (spec 015): your message, then each chip in the
 * order you added it, and nothing else (agent-runtime rule 5).
 */
export function composerBrief(
  message: string,
  chips: readonly BriefChip[],
  skills: readonly BriefSkill[] = [],
): AgentBrief {
  return {
    message,
    context: [
      ...chips.map((chip): AgentBrief['context'][number] => {
        if (chip.kind === 'jira') return ticketChip(chip);
        if (chip.kind === 'pull_request') return pullRequestChip(chip);
        return {
          kind: 'file',
          title: `File ${chip.path}`,
          body: `The user added this file from their computer. Read it at ${chip.real}. It's outside your worktree: you can read it, not change it.`,
        };
      }),
      // Then each skill your message named (spec 022, AC-53): its text, and where the rest of it is.
      ...skills.map((skill): AgentBrief['context'][number] => ({
        kind: 'skill',
        title: `Skill /${skill.name}`,
        body: [
          `The user asked for this skill with /${skill.name}. Follow it for this task.`,
          skill.folder === null
            ? null
            : `Its folder is ${skill.folder}: you can read the files in it, not change them.`,
          skill.text,
        ]
          .filter((part) => part !== null && part !== '')
          .join('\n\n'),
      })),
    ],
  };
}

/** The brief as Claude reads it: your message, then each chip's title and body, a blank line apart. */
export function briefText(brief: AgentBrief): string {
  const parts = brief.message.trim() === '' ? [] : [brief.message.trim()];
  for (const chip of brief.context) parts.push(`${chip.title}\n\n${chip.body}`);
  return parts.join('\n\n');
}

const once = (row: 'ask' | 'allow') => (row === 'ask' ? ', once the user allows it' : '');

/** What the note says about git: no push or pull request, unless Settings › Coding agent lets Claude (spec 026). */
function gitLines(branch: string, commands: boolean, { push, pullRequest }: NoteRows): string[] {
  if (!commands || (push === 'never' && pullRequest === 'never')) {
    return ["Don't push, open pull requests or change git settings."];
  }
  return [
    push === 'never'
      ? "Don't push."
      : `You may push this branch with exactly \`git push origin ${branch}\` on its own${once(push)}. Never force-push or push another branch.`,
    pullRequest === 'never'
      ? "Don't open pull requests."
      : `You may open its pull request with \`gh pr create\`${once(pullRequest)}.`,
    "Don't change git settings.",
  ];
}

/** The rows the note follows: what Claude may publish, and how its commands reach the network (spec 026). */
export type NoteRows = Pick<Permissions, 'push' | 'pullRequest' | 'network' | 'unsandboxed'>;
const askFirst: NoteRows = { push: 'never', pullRequest: 'never', network: 'ask', unsandboxed: 'ask' };

/** Your pull request's branch (spec 031): a detached worktree, so only `HEAD:<branch>` sends Claude's commits. */
function pullLines(branch: string, number: string, commands: boolean, { push }: NoteRows): string[] {
  if (!commands || push === 'never') {
    return [
      `Don't push, open pull requests or change git settings: Orynx pushes to ${number} when the user presses Push changes.`,
    ];
  }
  return [
    `You may push your commits to ${number} with exactly \`git push origin HEAD:${branch}\` on its own${once(push)}. Never force-push or push another branch.`,
    "Don't open pull requests or change git settings.",
  ];
}

/**
 * Added to Claude Code's own system prompt (011 Q5). Where Claude can run commands, the last sentences say
 * how they run (012 Q8g); where the sandbox can't run, that it can't (012 Q2b). Without a ticket, Claude does
 * what the brief asks (spec 015, Q8c). It may push or open the pull request only as Settings says (spec 026).
 */
export function sessionNote(
  branch: string,
  commands: boolean,
  ticket = true,
  rows = askFirst,
  /** Your pull request's number, when the worktree is its own branch (spec 031): Claude pushes to it only as `push` says. */
  pull: number | null = null,
): string {
  const ending = commands
    ? [
        'You can run commands in the worktree.',
        "They run in a sandbox with no network, and some wait for the user's approval.",
        // Each row lets its kind out of the sandbox, so Claude shouldn't give up on GitHub or an install (spec 026).
        `A command that reaches the network, such as gh, curl, git fetch or a package install, runs outside the sandbox${once(rows.network)}.`,
        `If the sandbox stops another command, run it again with dangerouslyDisableSandbox${once(rows.unsandboxed)}.`,
        "Run the project's tests and checks before you finish.",
        "When you're done, summarise what you changed and which checks you ran, in a few sentences.",
      ]
    : [
        "You can't run commands on this computer, so say which ones you'd run to check your work.",
        "When you're done, summarise what you changed in a few sentences.",
      ];
  const number = pull === null ? '' : `#${String(pull)}`;
  return [
    pull === null
      ? `You're working in a separate git worktree. Orynx makes its branch, ${branch}, when you first edit a file.`
      : `You're working in a separate git worktree on pull request ${number}'s own branch, ${branch}, with no local branch of its own.`,
    ticket ? 'Make the change the ticket asks for.' : 'Do what the user asks in the brief.',
    // The steps the user sees follow the work (spec 042).
    "Orynx shows the user this session's steps. When the work changes, such as a run that needs a fix, call set_steps with the whole list, the step you're on and why.",
    'If the repository has a CLAUDE.md, read it first.',
    // A detached worktree has no branch for `git push origin <branch>` to send (spec 031).
    ...(pull === null ? gitLines(branch, commands, rows) : pullLines(branch, number, commands, rows)),
    ...ending,
    // Claude can't ask mid-task: it asks in its summary, and you answer in the follow-up box (spec 013, Q2a).
    'If you need a decision from the user, finish and ask it in your summary. The user answers in a follow-up.',
  ].join(' ');
}

/**
 * An Ask session's note (spec 026): Claude answers from the folder as it is, and changes nothing. With no folder
 * (spec 031), it answers from the brief and the files it names.
 */
export function askNote(folder = true): string {
  return [
    ...(folder
      ? [
          "You're answering in the user's own folder, as it is: this is an Ask session.",
          "You can read and search the files here. You can't change files or run commands, and nothing you try will be allowed.",
          'If the repository has a CLAUDE.md, read it first.',
        ]
      : [
          "You're answering from the brief alone: this is an Ask session with no folder.",
          "You can read the files the brief names. You can't change files or run commands, and nothing you try will be allowed.",
        ]),
    'Answer what the user asks. If it needs changes, describe them; the user can start a Build session to make them.',
  ].join(' ');
}

const briefTitle = /^Jira ticket [A-Z][A-Z0-9_]*-\d+(?: \(([^)\n]*)\))?: [^\n]*$/;

/**
 * The ticket's type and description, read back from a brief saved before spec 013 kept them with the session
 * (spec 013, AC-9): the first line as `ticketBrief` writes it, then the description. Null for any other brief.
 */
export function ticketFromBrief(text: string): { type: string | null; description: string | null } | null {
  const [first = '', ...rest] = text.split('\n\n');
  const title = briefTitle.exec(first);
  if (title === null) return null;
  const description = rest.join('\n\n');
  return {
    type: title[1] ?? null,
    description: description === '' || description === 'No description.' ? null : description,
  };
}
