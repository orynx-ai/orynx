import { z } from 'zod';

const IdSchema = z.string().min(1);

/**
 * What the hub asks of the app about Claude's questions (spec 057, AC-15). The app imports no `@devhub` package, so
 * this is its own copy of the hub's `HubQuestionCommandSchema` in @devhub/contracts; apps/server's bridge test keeps
 * the two in step.
 */
export const QuestionCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('question'),
    id: IdSchema,
    title: z.string().min(1),
    body: z.string(),
    reply: z.boolean(),
    path: z.string().startsWith('/'),
    onlyInBackground: z.boolean(),
  }),
  z.object({ type: z.literal('question-withdrawn'), id: IdSchema }),
]);

/** What the app tells its hub: what you typed in the reply box, its `DesktopQuestionReplySchema`, the same way. */
export const QuestionReplySchema = z.object({ type: z.literal('question-reply'), id: IdSchema, text: z.string() });
export type QuestionReply = z.infer<typeof QuestionReplySchema>;

/** The part of Electron's `Notification` Orynx uses. */
export interface ShownNotification {
  show(): void;
  close(): void;
  on(event: 'reply', listener: (event: unknown, reply: string) => void): unknown;
  on(event: 'click', listener: () => void): unknown;
}

export interface WatchQuestionsOptions {
  notify(options: { title: string; body: string; hasReply: boolean; replyPlaceholder: string }): ShownNotification;
  /** Tells the hub what you typed. */
  tell(reply: QuestionReply): void;
  /** Whether an Orynx window is in front. */
  inFront(): boolean;
  /** Brings Orynx forward at `path`. */
  open(path: string): void;
}

/**
 * Claude's questions as macOS notifications (spec 057, AC-15): one at a time for each question, so a question shown
 * again replaces the one before, and a withdrawn one goes. `command` says whether a message was a question's.
 */
export function watchQuestions(options: WatchQuestionsOptions): { command(message: unknown): boolean } {
  const showing = new Map<string, ShownNotification>();
  return {
    command(message) {
      const read = QuestionCommandSchema.safeParse(message);
      if (!read.success) return false;
      const command = read.data;
      showing.get(command.id)?.close();
      showing.delete(command.id);
      if (command.type === 'question-withdrawn') return true;
      if (command.onlyInBackground && options.inFront()) return true;
      const shown = options.notify({
        title: command.title,
        body: command.body,
        hasReply: command.reply,
        replyPlaceholder: 'Number, your answer, or skip',
      });
      shown.on('reply', (_event, text) => {
        showing.delete(command.id);
        options.tell({ type: 'question-reply', id: command.id, text });
      });
      shown.on('click', () => {
        options.open(command.path);
      });
      showing.set(command.id, shown);
      shown.show();
      return true;
    },
  };
}
