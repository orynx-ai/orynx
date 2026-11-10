import { questionOtherLimit, type QuestionAnswer, type SessionQuestion } from '@devhub/contracts';
import { chatWords } from './words.ts';

/** What a chat reply says to Claude's question (spec 057, A): an answer, Skip, or a line asking again. */
export type ChatReply = { kind: 'answer'; answer: QuestionAnswer } | { kind: 'skip' } | { kind: 'again'; text: string };

const numbersOnly = /^\d+(?:[\s,]+\d+)*$/;

/**
 * A number picks that choice and several pick several where the question allows it (AC-2, AC-4); "skip" skips (AC-5);
 * anything else is the Other answer (AC-3). The session service still checks the answer against the question.
 */
export function readReply(question: SessionQuestion, reply: string): ChatReply {
  const text = reply.trim();
  const count = question.options.length;
  if (text === '') return { kind: 'again', text: chatWords.pickRange(count) };
  if (text.toLowerCase() === 'skip') return { kind: 'skip' };
  if (!numbersOnly.test(text)) {
    return text.length > questionOtherLimit
      ? { kind: 'again', text: chatWords.tooLong }
      : { kind: 'answer', answer: { picked: [], other: text } };
  }
  const numbers = [...new Set(text.split(/[\s,]+/).map(Number))];
  if (numbers.some((number) => number < 1 || number > count)) {
    return { kind: 'again', text: chatWords.pickRange(count) };
  }
  if (!question.multiSelect && numbers.length > 1) return { kind: 'again', text: chatWords.pickOne };
  const picked = numbers.flatMap((number) => question.options[number - 1]?.label ?? []);
  return { kind: 'answer', answer: { picked, other: null } };
}
