import { describe, expect, it } from 'vitest';
import { makeQuestionApproval } from '@devhub/contracts/testing';
import { approvalPing, questionMessage, severalQuestions } from './words.ts';

const where = { ticket: 'PROJ-1423', title: 'Add bulk archive' };
const [question] = makeQuestionApproval().questions;
if (question === undefined) throw new Error('the builder asks one question');

describe('what Orynx sends to Slack or Discord (spec 057, A)', () => {
  it('AC-1: a question names its ticket and session, numbers its choices with their descriptions, and says how to reply', () => {
    expect(questionMessage(where, question)).toBe(
      [
        'Claude has a question · PROJ-1423 · Add bulk archive',
        '',
        'Which date library should we use?',
        '',
        '1. date-fns: Already a dependency',
        '2. Day.js: Smaller, a new dependency',
        '3. Temporal: Built in, needs a polyfill',
        '',
        'Reply with a number, your own answer, or skip.',
      ].join('\n'),
    );
  });

  it('AC-4: a question that takes several choices says numbers like 1, 3 work', () => {
    const lines = questionMessage(where, { ...question, multiSelect: true }).split('\n');
    expect(lines.at(-1)).toBe('Reply with a number, numbers like 1, 3, your own answer, or skip.');
  });

  it('a choice with no description is its label alone, and a session with no ticket is its title alone', () => {
    const bare = {
      ...question,
      options: [
        { label: 'Yes', description: '' },
        { label: 'No', description: '' },
      ],
    };
    const lines = questionMessage({ ticket: null, title: 'Tidy the README' }, bare).split('\n');
    expect(lines[0]).toBe('Claude has a question · Tidy the README');
    expect(lines.slice(4, 6)).toEqual(['1. Yes', '2. No']);
  });

  it('AC-9: several questions say only how many, and to answer in Orynx', () => {
    expect(severalQuestions(where, 3)).toBe(
      'Claude has 3 questions in PROJ-1423 · Add bulk archive. Answer them in Orynx.',
    );
  });

  it('AC-10: an approval says Claude is waiting, and never what it wants to run', () => {
    expect(approvalPing(where)).toBe('Claude is waiting for you in PROJ-1423 · Add bulk archive. Answer it in Orynx.');
  });
});
