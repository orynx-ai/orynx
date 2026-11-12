import type { DesktopQuestion, SessionQuestion } from '@devhub/contracts';

/** The session a message is about: its ticket, when it has one, and its title. */
export interface ChatWhere {
  ticket: string | null;
  title: string;
}

function named({ ticket, title }: ChatWhere): string {
  return ticket === null ? title : `${ticket} · ${title}`;
}

/** Orynx's short replies in the question's thread (spec 057, Q9). */
export const chatWords = {
  sent: 'Sent to Claude.',
  pickRange: (count: number) => `Pick 1 to ${String(count)}, or type your answer.`,
  pickOne: 'Pick one number, or type your answer.',
  tooLong: 'Keep it under 2,000 characters.',
  answeredInOrynx: 'Answered in Orynx.',
  stopped: 'The session stopped.',
  useReply: "Use Reply on the question you're answering.",
};

/** A question's choices, numbered, each with its description. */
function choicesOf(question: SessionQuestion): string[] {
  return question.options.map(
    ({ label, description }, index) => `${String(index + 1)}. ${label}${description === '' ? '' : `: ${description}`}`,
  );
}

/** A call with one question (AC-1): who asks, the question, its choices numbered with their descriptions, and how to reply. */
export function questionMessage(where: ChatWhere, question: SessionQuestion): string {
  const choices = choicesOf(question);
  const how = question.multiSelect
    ? 'Reply with a number, numbers like 1, 3, your own answer, or skip.'
    : 'Reply with a number, your own answer, or skip.';
  return [`Claude has a question · ${named(where)}`, '', question.question, '', ...choices, '', how].join('\n');
}

/** A call with 2 to 4 questions (AC-9): only how many, since only Orynx answers them. */
export function severalQuestions(where: ChatWhere, count: number): string {
  return `Claude has ${String(count)} questions in ${named(where)}. Answer them in Orynx.`;
}

/** A command, edit or other approval (AC-10, Q1): a ping that never says what Claude wants to do. */
export function approvalPing(where: ChatWhere): string {
  return `Claude is waiting for you in ${named(where)}. Answer it in Orynx.`;
}

/**
 * The desktop app's notification for a question call (AC-15): one question with its numbered choices and a reply box,
 * or how many there are, to answer in Orynx.
 */
export function desktopQuestion(
  where: ChatWhere,
  questions: readonly SessionQuestion[],
): Pick<DesktopQuestion, 'title' | 'body' | 'reply'> {
  const [only, ...more] = questions;
  if (only === undefined || more.length > 0) {
    return {
      title: `Claude has ${String(questions.length)} questions`,
      body: `${named(where)}\nAnswer them in Orynx.`,
      reply: false,
    };
  }
  return {
    title: 'Claude has a question',
    body: [named(where), only.question, ...choicesOf(only)].join('\n'),
    reply: true,
  };
}
