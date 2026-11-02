/** What a review session says (spec 050, Q5). */
export const reviewWords = {
  author: 'Claude',
  /** A comment's note, by its file and line: "Claude on src/a.ts:42". */
  note: (path: string, line: number) => `Claude on ${path}:${String(line)}`,
  keep: 'Keep',
  edit: 'Edit',
  save: 'Save',
  cancel: 'Cancel',
  comment: 'Comment',
  posted: 'Posted',
  empty: 'Write a comment.',
  tooLong: 'Keep the comment under 65,536 characters.',
  unsaved: 'Couldn’t save the comment. Try again.',
};
