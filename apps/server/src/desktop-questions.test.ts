import { describe, expect, it } from 'vitest';
import { desktopQuestions } from './desktop-questions.ts';
import { desktopUpdateHost, type ParentPort } from './desktop-updates.ts';

/** The utility process's port to the desktop app: Electron's, outside the hub, so the test holds both ends. */
function fakePort() {
  const sent: unknown[] = [];
  const listeners: ((event: { data: unknown }) => void)[] = [];
  const port: ParentPort = {
    on: (_event, listener) => {
      listeners.push(listener);
    },
    postMessage: (message) => {
      sent.push(message);
    },
  };
  return {
    port,
    sent,
    tell: (data: unknown) => {
      for (const listener of listeners) listener({ data });
    },
  };
}

const question = {
  id: '0000000000000001 approval-q1',
  title: 'Claude has a question',
  body: 'Pick a date library\nWhich date library should we use?\n1. date-fns\n2. Day.js',
  reply: true,
  path: '/sessions/0000000000000001',
  onlyInBackground: true,
};

describe("Claude's questions in the desktop app (spec 057, AC-15)", () => {
  it('shows a question in the desktop app, withdraws it, and hands its reply on', () => {
    const { port, sent, tell } = fakePort();
    const questions = desktopQuestions(port);
    const replies: [string, string][] = [];
    questions.onReply((id, text) => replies.push([id, text]));

    questions.show(question);
    questions.withdraw(question.id);
    tell({ type: 'question-reply', id: question.id, text: '2' });

    expect(sent).toEqual([
      { type: 'question', ...question },
      { type: 'question-withdrawn', id: question.id },
    ]);
    expect(replies).toEqual([[question.id, '2']]);
  });

  it("ignores a reply it can't read, and the updater leaves question replies alone", () => {
    const { port, tell } = fakePort();
    const questions = desktopQuestions(port);
    const replies: string[] = [];
    questions.onReply((_id, text) => replies.push(text));
    const logged: string[] = [];
    desktopUpdateHost({ port, version: '0.1.37', logFile: 'orynx.log', log: (line) => logged.push(line) });

    tell({ type: 'question-reply', text: 'no id' });
    tell({ type: 'question-reply', id: question.id, text: 'skip' });

    expect(replies).toEqual(['skip']);
    expect(logged).toEqual([]);
  });
});
