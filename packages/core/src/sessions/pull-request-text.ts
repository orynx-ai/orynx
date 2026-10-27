import type { ChangedFile, FileDiff } from '@devhub/contracts';
import { mostPullRequestBodyCharacters, mostPullRequestTitleCharacters, mostReplyCharacters } from '@devhub/contracts';
import { z } from 'zod';

/**
 * The words around Create pull request and Push changes (spec 014): what Claude is sent for a draft (Q4), how its
 * answer is read, what Orynx adds to it (Q5), the draft when Claude can't answer (AC-6), and Orynx's commit
 * messages. Pure, so each shape of answer is a row in a table.
 */

/** The ticket the session started from, as the session keeps it; a session with no ticket has no key (spec 015). */
export interface DraftTicket {
  key: string | null;
  title: string;
  /** Null when Jira wasn't connected as the session started. */
  jiraUrl: string | null;
}

/** Exactly what Claude gets for a draft, and nothing else (Q4, AC-15). */
export interface DraftInputs {
  ticket: DraftTicket;
  /** What Claude was sent when the session started (`brief.md`); null when it's gone. */
  brief: string | null;
  /** Claude's "Finished" summaries, oldest first. */
  summaries: readonly string[];
  /** The subjects of the commits on the branch, oldest first. */
  commits: readonly string[];
  files: readonly ChangedFile[];
  moreFiles: number;
  /** The changed files' diffs, in the list's order. */
  diffs: readonly FileDiff[];
  /** The repository's pull request template; null when it has none. */
  template: string | null;
  /** The last 20 commit subjects on the base, newest first, so the title follows the team's style. */
  baseSubjects: readonly string[];
  base: string;
}

/** The diff Claude reads stops after this many lines; the rest is only counted (Q4, as 013's Changes tab cuts). */
const mostDiffLines = 2_000;
const mostTemplateCharacters = 10_000;

export const coAuthorLine = 'Co-Authored-By: Claude <noreply@anthropic.com>';

/** Claude's instructions for a draft: the shape of its answer, and what it mustn't do. */
export const draftInstructions = [
  "You write a pull request's title and description for a change another Claude session made in a git repository.",
  'Answer with the title on the first line, then a blank line, then the description in GitHub Markdown, and nothing else.',
  "The title is one line under 72 characters, in the style of the base branch's recent commit subjects, and names the ticket's key.",
  'The description says what changed and why, and how it was checked, in a few short sections.',
  'When the repository has a pull request template, follow its headings.',
  "Use only what the ticket, the summaries, the commits and the diff show. Don't invent checks that weren't run.",
  "Don't add a Jira link: Orynx adds it.",
].join(' ');

/** The instructions for this session's draft: a session with no ticket has no key to name (spec 015, AC-34). */
export function draftInstructionsFor(ticket: DraftTicket): string {
  return ticket.key === null
    ? draftInstructions.replace(
        " in the style of the base branch's recent commit subjects, and names the ticket's key.",
        " in the style of the base branch's recent commit subjects.",
      )
    : draftInstructions;
}

/** Claude's instructions for a Push changes commit message (Q7). */
export const pushInstructions = [
  'You write a git commit message for changes made in a git repository after its pull request was opened.',
  'Answer with one line under 72 characters, in the imperative, and nothing else.',
].join(' ');

function countsLine(file: ChangedFile): string {
  return file.binary ? `- ${file.path} (binary)` : `- ${file.path} +${String(file.added)} −${String(file.removed)}`;
}

function filesSection(files: readonly ChangedFile[], moreFiles: number): string {
  const lines = files.map(countsLine);
  if (moreFiles > 0) lines.push(`…and ${String(moreFiles)} more files`);
  return lines.join('\n');
}

/** The diffs as unified diff text, until `mostDiffLines` lines; then a line saying the rest is left out. */
function diffSection(diffs: readonly FileDiff[]): string {
  const out: string[] = [];
  let left = mostDiffLines;
  for (const diff of diffs) {
    const renamed = diff.renamedFrom === null ? '' : ` (renamed from ${diff.renamedFrom})`;
    if (diff.binary) {
      out.push(`${diff.path}${renamed}: a binary file`);
      continue;
    }
    if (left <= 0) {
      out.push('The rest of the diff is left out; the list of changed files above has its counts.');
      break;
    }
    out.push(`${diff.path}${renamed}`);
    for (const line of diff.lines.slice(0, left)) {
      if (line.kind === 'hunk') out.push(line.text);
      else out.push(`${line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '}${line.text}`);
    }
    left -= diff.lines.length;
    if (left < 0) {
      out.push('The rest of the diff is left out; the list of changed files above has its counts.');
      break;
    }
  }
  return out.join('\n');
}

function section(title: string, body: string): string | null {
  return body.trim() === '' ? null : `${title}\n\n${body}`;
}

function listed(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

/** `PROJ-1423: Add bulk archive`, or the title alone for a session with no ticket (spec 015). */
function named(ticket: DraftTicket): string {
  return ticket.key === null ? ticket.title : `${ticket.key}: ${ticket.title}`;
}

export function draftPrompt(inputs: DraftInputs): string {
  const { ticket } = inputs;
  const heading = ticket.key === null ? 'The task, as Claude got it' : `The ticket, ${ticket.key}, as Claude got it`;
  return [
    section(heading, inputs.brief ?? named(ticket)),
    section(
      "Claude's summaries of its work",
      inputs.summaries.map((summary, index) => `${String(index + 1)}. ${summary}`).join('\n'),
    ),
    section('Commits on the branch', listed(inputs.commits)),
    section('Changed files', filesSection(inputs.files, inputs.moreFiles)),
    section('The diff', diffSection(inputs.diffs)),
    inputs.template === null
      ? null
      : section("The repository's pull request template", inputs.template.slice(0, mostTemplateCharacters)),
    section(`Recent commit subjects on ${inputs.base}`, listed(inputs.baseSubjects)),
  ]
    .filter((part) => part !== null)
    .join('\n\n');
}

/** The new changes since the last push, for a Push changes commit message (Q7). */
export interface PushInputs {
  ticket: DraftTicket;
  /** Claude's "Finished" summaries since the last push. */
  summaries: readonly string[];
  files: readonly ChangedFile[];
  moreFiles: number;
  diffs: readonly FileDiff[];
}

export function pushPrompt(inputs: PushInputs): string {
  return [
    section(inputs.ticket.key === null ? 'The task' : 'The ticket', named(inputs.ticket)),
    section("Claude's summaries since the last push", inputs.summaries.join('\n\n')),
    section('Changed files since the last push', filesSection(inputs.files, inputs.moreFiles)),
    section('The diff', diffSection(inputs.diffs)),
  ]
    .filter((part) => part !== null)
    .join('\n\n');
}

/** A line as Claude may dress it: a heading, bold, quotes or backticks around it. */
function plainLine(line: string): string {
  let text = line.trim().replace(/^#+\s*/, '');
  for (;;) {
    const unwrapped = text.replace(/^(\*\*|["'`])(.*)\1$/s, '$2').trim();
    if (unwrapped === text) return text;
    text = unwrapped;
  }
}

/**
 * The title with the ticket's key in front when it doesn't hold it already (Q5), at most 256 characters. A
 * session with no ticket keeps its title as it is (spec 015, AC-34).
 */
function withKey(title: string, key: string | null): string {
  const keyed = key === null || title.toUpperCase().includes(key.toUpperCase()) ? title : `${key}: ${title}`;
  return keyed.slice(0, mostPullRequestTitleCharacters);
}

/** The description with "Jira: [KEY](link)" at its end when it doesn't link the ticket already (Q5). */
function withJiraLine(body: string, ticket: DraftTicket): string {
  if (ticket.key === null || ticket.jiraUrl === null || body.includes(ticket.jiraUrl)) {
    return body.slice(0, mostPullRequestBodyCharacters);
  }
  const line = `Jira: [${ticket.key}](${ticket.jiraUrl})`;
  if (body === '') return line;
  const room = mostPullRequestBodyCharacters - line.length - 2;
  return `${body.slice(0, room)}\n\n${line}`;
}

export interface DraftText {
  title: string;
  body: string;
}

/** Claude's answer as a title and description, with Orynx's additions; null when it holds no title (AC-6). */
export function readDraft(answer: string, ticket: DraftTicket): DraftText | null {
  const lines = answer.split('\n');
  const first = lines.findIndex((line) => plainLine(line) !== '');
  if (first === -1) return null;
  const body = lines
    .slice(first + 1)
    .join('\n')
    .trim();
  return { title: withKey(plainLine(lines[first] ?? ''), ticket.key), body: withJiraLine(body, ticket) };
}

/** The draft when Claude can't answer: the ticket's title and Claude's last summary (AC-6). */
export function fallbackDraft(ticket: DraftTicket, summaries: readonly string[]): DraftText {
  const last = summaries.at(-1)?.trim() ?? '';
  return { title: withKey(ticket.title, ticket.key), body: withJiraLine(last, ticket) };
}

/** Claude's answer as a one-line commit message, or null when it holds none. */
export function readCommitMessage(answer: string): string | null {
  const line = answer
    .split('\n')
    .map(plainLine)
    .find((text) => text !== '');
  return line === undefined ? null : line.slice(0, mostPullRequestTitleCharacters);
}

/** A commit Orynx makes: your words, then the Co-Authored-By line (Q5). */
export function commitMessage(subject: string): string {
  return `${subject}\n\n${coAuthorLine}`;
}

/** Claude's instructions for replies to a pull request's review threads (spec 049). */
export const replyInstructions = [
  "You write replies to a pull request's review comments, for changes another Claude session made to address them.",
  "You get the unresolved review threads, each with its id, file, line and comments, and the session's diff.",
  'For each thread the changes address, write a short reply in GitHub Markdown, one or two sentences, saying what',
  "changed. Leave out every thread the changes don't address. Use only what the threads and the diff show.",
  'Answer with JSON and nothing else: {"replies":[{"thread":"<id>","reply":"<text>"}]}',
].join(' ');

export interface ReplyThread {
  id: string;
  path: string;
  line: number | null;
  comments: readonly { author: string; body: string }[];
}

export interface ReplyInputs {
  threads: readonly ReplyThread[];
  summaries: readonly string[];
  files: readonly ChangedFile[];
  moreFiles: number;
  diffs: readonly FileDiff[];
}

export function replyPrompt(inputs: ReplyInputs): string {
  const threads = inputs.threads.map((thread) => {
    const where = thread.line === null ? thread.path : `${thread.path} line ${String(thread.line)}`;
    const comments = thread.comments.map((comment) => `${comment.author}: ${comment.body}`).join('\n');
    return `Thread ${thread.id} on ${where}\n${comments}`;
  });
  return [
    section('The unresolved review threads', threads.join('\n\n')),
    section("Claude's summaries", inputs.summaries.join('\n\n')),
    section('Changed files', filesSection(inputs.files, inputs.moreFiles)),
    section('The diff', diffSection(inputs.diffs)),
  ]
    .filter((part) => part !== null)
    .join('\n\n');
}

const RepliesSchema = z.object({
  replies: z.array(z.object({ thread: z.string(), reply: z.string() })),
});

/**
 * Claude's replies by thread, for these threads only, each at most `mostReplyCharacters`; null when the answer holds
 * no JSON of that shape, so every box starts empty (spec 049, AC-4).
 */
export function readReplies(answer: string, threads: readonly string[]): ReadonlyMap<string, string> | null {
  const start = answer.indexOf('{');
  const end = answer.lastIndexOf('}');
  if (start === -1 || end < start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(answer.slice(start, end + 1));
  } catch {
    return null;
  }
  const replies = RepliesSchema.safeParse(parsed);
  if (!replies.success) return null;
  const known = new Set(threads);
  return new Map(
    replies.data.replies
      .filter(({ thread, reply }) => known.has(thread) && reply.trim() !== '')
      .map(({ thread, reply }) => [thread, reply.trim().slice(0, mostReplyCharacters)]),
  );
}
