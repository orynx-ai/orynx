/**
 * Names for a session started from the composer without a ticket (spec 015, Q8): its title, from your message,
 * and its branch, from the title. A session on a ticket keeps the ticket's summary and `feat/<KEY>` (spec 011).
 */

/** A title holds at most this many characters, "…" included. */
const mostTitleCharacters = 80;
/** A branch's slug takes at most this many words and characters. */
const mostSlugWords = 5;
const mostSlugCharacters = 40;

/** The message's first line with words, its spacing tidied, cut on a word with "…" when it's too long. */
export function titleFrom(message: string): string {
  const line =
    message
      .split('\n')
      .map((part) => part.trim().replace(/\s+/g, ' '))
      .find((part) => part !== '') ?? '';
  if (line.length <= mostTitleCharacters) return line;
  const room = line.slice(0, mostTitleCharacters - 1);
  const space = room.lastIndexOf(' ');
  return `${(space > 0 ? room.slice(0, space) : room).trimEnd()}…`;
}

/**
 * `add-a-csv-export-to` for "Add a CSV export to the reports page": the first five words in lower-case ASCII
 * letters and digits, accents dropped, joined by hyphens and cut on a word at 40 characters. `task` when
 * nothing is left, as for a title in another script.
 */
export function branchSlug(title: string): string {
  const words = title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '')
    .slice(0, mostSlugWords);
  let slug = '';
  for (const word of words) {
    const next = slug === '' ? word : `${slug}-${word}`;
    if (next.length > mostSlugCharacters) break;
    slug = next;
  }
  if (slug === '' && words[0] !== undefined) slug = words[0].slice(0, mostSlugCharacters);
  return slug === '' ? 'task' : slug;
}
