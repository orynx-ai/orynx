import type { ChangedFile, FileDiff } from '@devhub/contracts';
import { mostPullRequestBodyCharacters, mostPullRequestTitleCharacters } from '@devhub/contracts';

/**
 * The words around Create pull request and Push changes (spec 014): what Claude is sent for a draft (Q4), how its
 * answer is read, what Orynx adds to it (Q5), the draft when Claude can't answer (AC-6), and Orynx's commit
 * messages. Pure, so each shape of answer is a row in a table.
 */

/** The ticket the session started from, as the session keeps it. */
export interface DraftTicket {
  key: string;
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

export function draftPrompt(inputs: DraftInputs): string {
  const { ticket } = inputs;
  return [
    section(`The ticket, ${ticket.key}, as Claude got it`, inputs.brief ?? `${ticket.key}: ${ticket.title}`),
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
    section(`The ticket`, `${inputs.ticket.key}: ${inputs.ticket.title}`),
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

/** The title with the ticket's key in front when it doesn't hold it already (Q5), at most 256 characters. */
function withKey(title: string, key: string): string {
  const keyed = title.toUpperCase().includes(key.toUpperCase()) ? title : `${key}: ${title}`;
  return keyed.slice(0, mostPullRequestTitleCharacters);
}

/** The description with "Jira: [KEY](link)" at its end when it doesn't link the ticket already (Q5). */
function withJiraLine(body: string, ticket: DraftTicket): string {
  if (ticket.jiraUrl === null || body.includes(ticket.jiraUrl)) return body.slice(0, mostPullRequestBodyCharacters);
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
