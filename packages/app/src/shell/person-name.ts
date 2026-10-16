/** How the sidebar footer shows a person: "Rakesh D." and "RD" for "Rakesh Dhariwal", like the design. */
export function personName(fullName: string): { short: string; initials: string } {
  const words = fullName.trim().split(/\s+/);
  const first = words[0] ?? '';
  const last = words.length > 1 ? (words.at(-1) ?? '') : '';
  const initial = (word: string) => (Array.from(word)[0] ?? '').toUpperCase();
  return {
    short: last === '' ? first : `${first} ${initial(last)}.`,
    initials: `${initial(first)}${initial(last)}`,
  };
}
