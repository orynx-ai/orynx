import { ComposerChipSchema, composerLimits, type ComposerChip, type Repository } from '@devhub/contracts';
import type { FileRefusal } from './composer-words.ts';

/** The composer's rules (spec 015): a paste that becomes a chip, a file it takes, adding a chip, and its folder. */

const jiraKey = /^[A-Z][A-Z0-9_]{0,99}-[1-9]\d{0,9}$/;
const pullLink = /^https:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/([1-9]\d{0,9})(?:[/?#]\S*)?$/;

/**
 * AC-14 (Q6): a paste that is exactly one Jira key or one link to a pull request on github.com becomes that chip,
 * checked as the server will check it. Anything else is pasted as text.
 */
export function chipFromPaste(pasted: string): ComposerChip | null {
  const text = pasted.trim();
  if (jiraKey.test(text)) return { kind: 'jira', key: text };
  const link = pullLink.exec(text);
  if (link === null) return null;
  const chip = ComposerChipSchema.safeParse({
    kind: 'pull_request',
    owner: link[1],
    name: link[2],
    number: Number(link[3]),
  });
  return chip.success ? chip.data : null;
}

/** AC-12 (Q5): a file is text when it decodes as UTF-8 and holds no NUL byte, and it holds at most 100 KB. */
export function fileChipFrom(
  name: string,
  bytes: Uint8Array,
): Extract<ComposerChip, { kind: 'file' }> | Exclude<FileRefusal, { kind: 'too_many' }> {
  if (bytes.byteLength > composerLimits.fileBytes) return { kind: 'too_big', name };
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { kind: 'not_text', name };
  }
  if (text.includes('\u0000')) return { kind: 'not_text', name };
  return { kind: 'file', name, text };
}

/** Why a chip wasn't added: its kind is full (spec 022, Q5). */
export type ChipRefusal = 'too_many_tickets' | 'too_many_pull_requests' | 'too_many_files';

export type AddChip = { ok: true; chips: ComposerChip[] } | { ok: false; refusal: ChipRefusal };

/** Whether two chips name the same ticket, pull request or file. */
export function sameChip(a: ComposerChip, b: ComposerChip): boolean {
  if (a.kind === 'pull_request' && b.kind === 'pull_request') {
    return `${a.owner}/${a.name}`.toLowerCase() === `${b.owner}/${b.name}`.toLowerCase() && a.number === b.number;
  }
  if (a.kind === 'file' && b.kind === 'file') return a.name === b.name && a.text === b.text;
  return a.kind === 'jira' && b.kind === 'jira' && a.key === b.key;
}

const limits = {
  jira: { most: composerLimits.tickets, refusal: 'too_many_tickets' },
  pull_request: { most: composerLimits.pullRequests, refusal: 'too_many_pull_requests' },
  file: { most: composerLimits.files, refusal: 'too_many_files' },
} as const satisfies Record<ComposerChip['kind'], { most: number; refusal: ChipRefusal }>;

/** Whether the composer holds this chip already. */
export function holds(chips: readonly ComposerChip[], chip: ComposerChip): boolean {
  return chips.some((held) => sameChip(held, chip));
}

/**
 * Adds a chip at the end (spec 022): another ticket goes after the first, which stays the session's (Q2); the same
 * chip twice changes nothing, and a full kind says why (Q5).
 */
export function addChip(chips: readonly ComposerChip[], chip: ComposerChip): AddChip {
  if (holds(chips, chip)) return { ok: true, chips: [...chips] };
  const refusal = refusalFor(chips, chip.kind);
  return refusal === null ? { ok: true, chips: [...chips, chip] } : { ok: false, refusal };
}

/** Why no more chips of this kind can be added, or null while there's room (spec 022, Q5). */
export function refusalFor(chips: readonly ComposerChip[], kind: ComposerChip['kind']): ChipRefusal | null {
  const { most, refusal } = limits[kind];
  return chips.filter((held) => held.kind === kind).length >= most ? refusal : null;
}

/** The session's own ticket: the first one added (spec 022, Q2), or null. */
export function firstTicket(chips: readonly ComposerChip[]): string | null {
  return chips.find((chip) => chip.kind === 'jira')?.key ?? null;
}

export type ShownFolder = { kind: 'folder'; folder: Repository } | { kind: 'choose' } | { kind: 'none' };

/**
 * AC-17, AC-18 (Q7): the folder you picked; else the ticket project's only folder; else the one you last used;
 * else the only folder. A project with several folders, or several folders and nothing to go on, is a choice.
 */
export function folderFor({
  folders,
  picked,
  ticketKey,
  lastUsed,
}: {
  folders: readonly Repository[];
  picked: string | null;
  ticketKey: string | null;
  lastUsed: string | null;
}): ShownFolder {
  if (folders.length === 0) return { kind: 'none' };
  const byId = (id: string | null) => folders.find((folder) => folder.id === id);
  const chosen = byId(picked);
  if (chosen !== undefined) return { kind: 'folder', folder: chosen };
  if (ticketKey !== null) {
    const project = ticketKey.slice(0, ticketKey.lastIndexOf('-'));
    const mapped = folders.filter((folder) => folder.jiraProject === project);
    if (mapped.length > 1) return { kind: 'choose' };
    if (mapped[0] !== undefined) return { kind: 'folder', folder: mapped[0] };
  }
  const last = byId(lastUsed);
  if (last !== undefined) return { kind: 'folder', folder: last };
  if (folders.length === 1 && folders[0] !== undefined) return { kind: 'folder', folder: folders[0] };
  return { kind: 'choose' };
}
