/**
 * How Home's search (spec 007, Q10a) and ⌘K search (spec 009) match what was typed: every word must be
 * found somewhere in the text, ignoring case. Not fuzzy. Nothing typed matches everything.
 */
export function matchesWords(text: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = text.toLowerCase();
  return words.every((word) => haystack.includes(word));
}
