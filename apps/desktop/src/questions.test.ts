import { describe, expect, it } from 'vitest';
import { watchQuestions, type ShownNotification } from './questions.ts';

/** Electron's notifications, outside the app's code: what was shown, and your reply or click on one. */
function fakeNotifications() {
  const shown: {
    options: { title: string; body: string; hasReply: boolean; replyPlaceholder: string };
    closed: boolean;
  }[] = [];
  const replies: ((text: string) => void)[] = [];
  const clicks: (() => void)[] = [];
  const notify = (options: (typeof shown)[number]['options']): ShownNotification => {
    const entry = { options, closed: false };
    return {
      show: () => shown.push(entry),
      close: () => {
        entry.closed = true;
      },
      on: (event: 'reply' | 'click', listener: ((event: unknown, reply: string) => void) | (() => void)) => {
        if (event === 'reply') replies.push((text) => { (listener)({}, text); });
        else clicks.push(listener as () => void);
      },
    };
  };
  return {
    shown,
    notify,
    reply: (index: number, text: string) => replies[index]?.(text),
    click: (index: number) => clicks[index]?.(),
  };
}

const question = {
  type: 'question',
  id: '0000000000000001 approval-q1',
  title: 'Claude has a question',
  body: 'Pick a date library\nWhich date library should we use?\n1. date-fns\n2. Day.js',
  reply: true,
  path: '/sessions/0000000000000001',
  onlyInBackground: true,
};

function watch({ inFront = false } = {}) {
  const notifications = fakeNotifications();
  const told: unknown[] = [];
  const opened: string[] = [];
  const questions = watchQuestions({
    notify: notifications.notify,
    tell: (reply) => told.push(reply),
    inFront: () => inFront,
    open: (path) => opened.push(path),
  });
  return { ...notifications, questions, told, opened };
}

describe("Claude's question in a macOS notification (spec 057, AC-15)", () => {
  it('shows the question with a reply box, and tells the hub what you typed', () => {
    const { questions, shown, reply, told } = watch();

    expect(questions.command(question)).toBe(true);
    reply(0, '2');

    expect(shown.map(({ options }) => options)).toEqual([
      { title: question.title, body: question.body, hasReply: true, replyPlaceholder: 'Number, your answer, or skip' },
    ]);
    expect(told).toEqual([{ type: 'question-reply', id: question.id, text: '2' }]);
  });

  it('a click opens the session; showing it again or withdrawing it closes the one before', () => {
    const { questions, shown, click, opened } = watch();
    questions.command(question);
    click(0);
    questions.command({ ...question, title: 'Pick 1 to 3, or type your answer.' });
    questions.command({ type: 'question-withdrawn', id: question.id });

    expect(opened).toEqual(['/sessions/0000000000000001']);
    expect(shown.map(({ closed }) => closed)).toEqual([true, true]);
  });

  it('shows nothing while an Orynx window is in front, if Settings asks, and leaves other messages to the updater', () => {
    const front = watch({ inFront: true });
    expect(front.questions.command(question)).toBe(true);
    expect(front.questions.command({ ...question, onlyInBackground: false })).toBe(true);
    expect(front.shown).toHaveLength(1);

    expect(front.questions.command({ type: 'download', version: '0.1.38' })).toBe(false);
  });
});
