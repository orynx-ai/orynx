import { z } from 'zod';
import { mostReviewTextCharacters, type DiffLine, type ReviewVerdict } from '@devhub/contracts';
import type { OrynxTool } from '../agents/agent-adapter.ts';

/**
 * Orynx's tool for a review session (spec 050): Claude leaves a comment on a line of the pull request's diff, which
 * Orynx keeps for you to keep, edit or drop. Nothing goes to GitHub until you press Post review.
 */

export interface ReviewToolsContext {
  /** `path`'s lines in the pull request's diff, as the Changes tab numbers them; null when it isn't in the diff. */
  diffLines(path: string): Promise<readonly DiffLine[] | null>;
  /** Keeps the comment and adds its step; `full` when the session has its 20 already. */
  save(comment: { path: string; line: number; side: 'new' | 'old'; text: string }): Promise<'saved' | 'full'>;
}

const CommentSchema = z.object({
  path: z.string().trim().min(1).max(4096),
  line: z.int().positive(),
  side: z.enum(['new', 'old']).default('new'),
  text: z.string().trim().min(1).max(mostReviewTextCharacters),
});

/** GitHub takes a comment only on a line its diff shows: unchanged and added lines by the new file's number, removed ones by the old's. */
function inDiff(lines: readonly DiffLine[], line: number, side: 'new' | 'old'): boolean {
  return lines.some(
    (shown) =>
      shown.kind !== 'hunk' &&
      shown.number === line &&
      (side === 'old' ? shown.kind === 'removed' : shown.kind !== 'removed'),
  );
}

export function reviewTools(context: ReviewToolsContext): OrynxTool[] {
  return [
    {
      name: 'review_comment',
      description:
        'Leaves a review comment on one line of the pull request\'s diff. The user keeps, edits or drops each one before anything goes to GitHub. `path` is the file\'s path in the repository; `line` is the line\'s number in the new file with side "new" (an added or unchanged line), or in the old file with side "old" (a removed line). `text` is GitHub Markdown, and may hold a ```suggestion block replacing a few new-side lines. At most 20 comments: comment only on what matters, and put the rest in your summary.',
      input: CommentSchema,
      asks: () => Promise.resolve(null),
      async run(input) {
        const comment = CommentSchema.safeParse(input);
        if (!comment.success)
          return {
            text: "Orynx couldn't read this comment: send path, line, side (new or old) and text.",
            error: true,
          };
        const { path, line, side } = comment.data;
        const lines = await context.diffLines(path);
        if (lines === null || !inDiff(lines, line, side)) {
          return {
            text: `Line ${String(line)} of ${path} isn't in this pull request's diff. Comment on a line in the diff, or put it in your summary.`,
            error: true,
          };
        }
        if ((await context.save(comment.data)) === 'full')
          return { text: "That's 20 comments. Put the rest in your summary.", error: true };
        return {
          text: `Orynx kept your comment on ${path}:${String(line)} for the user to keep, edit or drop. Nothing went to GitHub.`,
        };
      },
    },
  ];
}

const verdictLine = /^\**verdict:?\**:?\s*\**(approve|comment|request changes)\**\.?$/i;

/** Claude's summary without its last line, `Verdict: approve | comment | request changes`, and that verdict; none without it. */
export function readVerdict(text: string): { summary: string; verdict: ReviewVerdict | null } {
  const lines = text.trim().split('\n');
  const found = verdictLine.exec(lines.at(-1)?.trim() ?? '')?.[1]?.toLowerCase();
  if (found === undefined) return { summary: text.trim(), verdict: null };
  return {
    summary: lines.slice(0, -1).join('\n').trim(),
    verdict: found === 'request changes' ? 'request_changes' : (found as 'approve' | 'comment'),
  };
}
