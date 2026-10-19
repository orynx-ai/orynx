/** The id of the shell's `<main>`; the skip link and New task move focus here. */
export const mainContentId = 'main';

export function focusMainContent(): void {
  document.getElementById(mainContentId)?.focus();
}

/** The id of Home's composer box (spec 015), where New task puts focus once Home is on screen. */
export const newTaskTargetId = 'new-task';

/** Focus in the composer when Home shows it, else on the main region as before. */
export function focusNewTask(): void {
  (document.getElementById(newTaskTargetId) ?? document.getElementById(mainContentId))?.focus();
}
