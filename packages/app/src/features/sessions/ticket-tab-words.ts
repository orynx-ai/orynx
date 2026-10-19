/** The Context tab's words (spec 013, Q10f; the Context tab and full screen, the user's call, 19 Oct 2026). */

export const briefNote = {
  title: "Claude's brief",
  body: "Claude started from this ticket's title and description, as they were when the session started. Comments, linked issues and other fields weren't sent.",
};

export const noDescription = 'This ticket has no description.';

export const contextWords = {
  tab: 'Context',
  list: 'Context Claude was sent',
  fullScreen: 'Full screen',
  close: 'Close',
} as const;
