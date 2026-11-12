import { z } from 'zod';

/**
 * A question the hub asks the desktop app to show (spec 057, AC-15): a macOS notification, with a reply box when the
 * call has one question. The app keeps its own copy of these shapes (it imports no `@devhub` package), and each side
 * parses what it receives, as for updates (spec 045).
 */
export const DesktopQuestionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string(),
  /** A reply box: only a call with one question takes a reply. */
  reply: z.boolean(),
  /** Where a click opens. */
  path: z.string().startsWith('/'),
  /** Settings › Notifications: only when no Orynx window is in front. */
  onlyInBackground: z.boolean(),
});
export type DesktopQuestion = z.infer<typeof DesktopQuestionSchema>;

/** The hub to the desktop app: show a question, or take it away once it's answered or its session stopped. */
export const HubQuestionCommandSchema = z.discriminatedUnion('type', [
  DesktopQuestionSchema.extend({ type: z.literal('question') }),
  z.object({ type: z.literal('question-withdrawn'), id: z.string().min(1) }),
]);
export type HubQuestionCommand = z.infer<typeof HubQuestionCommandSchema>;

/** The desktop app to the hub: what you typed in a question's reply box. */
export const DesktopQuestionReplySchema = z.object({
  type: z.literal('question-reply'),
  id: z.string().min(1),
  text: z.string(),
});
export type DesktopQuestionReply = z.infer<typeof DesktopQuestionReplySchema>;
