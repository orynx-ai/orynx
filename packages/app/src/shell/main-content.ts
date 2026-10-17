/** The id of the shell's `<main>`; the skip link and New task move focus here. */
export const mainContentId = 'main';

export function focusMainContent(): void {
  document.getElementById(mainContentId)?.focus();
}
