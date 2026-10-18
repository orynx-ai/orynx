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

export type AddChip =
  { ok: true; chips: ComposerChip[] } | { ok: false; refusal: 'too_many_pull_requests' | 'too_many_files' };

function same(a: ComposerChip, b: ComposerChip): boolean {
  if (a.kind === 'pull_request' && b.kind === 'pull_request') {
    return `${a.owner}/${a.name}`.toLowerCase() === `${b.owner}/${b.name}`.toLowerCase() && a.number === b.number;
  }
  if (a.kind === 'file' && b.kind === 'file') return a.name === b.name && a.text === b.text;
  return a.kind === 'jira' && b.kind === 'jira' && a.key === b.key;
}

/** Adds a chip at the end: a ticket takes the place of the one there (Q2), the same chip twice changes nothing. */
export function addChip(chips: readonly ComposerChip[], chip: ComposerChip): AddChip {
  if (chips.some((held) => same(held, chip))) return { ok: true, chips: [...chips] };
  if (chip.kind === 'jira') {
    const at = chips.findIndex((held) => held.kind === 'jira');
    return { ok: true, chips: at === -1 ? [...chips, chip] : chips.map((held, n) => (n === at ? chip : held)) };
  }
  const count = chips.filter((held) => held.kind === chip.kind).length;
  if (chip.kind === 'pull_request' && count >= composerLimits.pullRequests) {
    return { ok: false, refusal: 'too_many_pull_requests' };
  }
  if (chip.kind === 'file' && count >= composerLimits.files) return { ok: false, refusal: 'too_many_files' };
  return { ok: true, chips: [...chips, chip] };
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
