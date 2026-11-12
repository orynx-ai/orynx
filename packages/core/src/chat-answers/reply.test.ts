import { describe, expect, it } from 'vitest';
import { makeQuestionApproval } from '@devhub/contracts/testing';
import { readReply } from './reply.ts';

const [question] = makeQuestionApproval().questions;
if (question === undefined) throw new Error('the builder asks one question');
const several = { ...question, multiSelect: true };

describe("a chat reply to Claude's question (spec 057, A)", () => {
  it('AC-2: a number picks that choice', () => {
    expect(readReply(question, '2')).toEqual({ kind: 'answer', answer: { picked: ['Day.js'], other: null } });
    expect(readReply(question, ' 1 ')).toEqual({ kind: 'answer', answer: { picked: ['date-fns'], other: null } });
  });

  it('AC-3: any other text is the Other answer, as you typed it', () => {
    expect(readReply(question, "Use date-fns, it's already a dependency")).toEqual({
      kind: 'answer',
      answer: { picked: [], other: "Use date-fns, it's already a dependency" },
    });
  });

  it('AC-4: several numbers pick several where the question allows it, each once', () => {
    expect(readReply(several, '1, 3')).toEqual({
      kind: 'answer',
      answer: { picked: ['date-fns', 'Temporal'], other: null },
    });
    expect(readReply(several, '3 1 3')).toEqual({
      kind: 'answer',
      answer: { picked: ['Temporal', 'date-fns'], other: null },
    });
  });

  it('AC-4: several numbers on a one-pick question ask again', () => {
    expect(readReply(question, '1, 3')).toEqual({ kind: 'again', text: 'Pick one number, or type your answer.' });
  });

  it('AC-5: a number out of range asks again, with the range', () => {
    expect(readReply(question, '7')).toEqual({ kind: 'again', text: 'Pick 1 to 3, or type your answer.' });
    expect(readReply(several, '1, 0')).toEqual({ kind: 'again', text: 'Pick 1 to 3, or type your answer.' });
  });

  it('AC-5: skip skips, in any case', () => {
    expect(readReply(question, 'skip')).toEqual({ kind: 'skip' });
    expect(readReply(question, ' Skip ')).toEqual({ kind: 'skip' });
  });

  it('an empty reply, or Other past 2,000 characters, asks again', () => {
    expect(readReply(question, '   ')).toEqual({ kind: 'again', text: 'Pick 1 to 3, or type your answer.' });
    expect(readReply(question, 'x'.repeat(2001))).toEqual({ kind: 'again', text: 'Keep it under 2,000 characters.' });
    expect(readReply(question, 'x'.repeat(2000))).toMatchObject({ kind: 'answer' });
  });
});
