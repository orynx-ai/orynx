import { DesktopQuestionReplySchema } from '@devhub/contracts';
import type { DesktopQuestions } from '@devhub/core';
import type { ParentPort } from './desktop-updates.ts';

/**
 * Claude's questions in the desktop app on macOS (spec 057, AC-15): the hub asks Electron to show each one over the
 * utility process's port, and hears back what you typed in its reply box. The window still gets no preload.
 */
export function desktopQuestions(port: ParentPort): DesktopQuestions {
  const listeners = new Set<(id: string, text: string) => void>();
  port.on('message', ({ data }) => {
    const reply = DesktopQuestionReplySchema.safeParse(data);
    if (!reply.success) return;
    for (const listener of listeners) listener(reply.data.id, reply.data.text);
  });
  return {
    show(question) {
      port.postMessage({ type: 'question', ...question });
    },
    withdraw(id) {
      port.postMessage({ type: 'question-withdrawn', id });
    },
    onReply(listener) {
      listeners.add(listener);
    },
  };
}
