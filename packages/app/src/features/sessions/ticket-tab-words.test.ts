import { describe, expect, it } from 'vitest';
import { briefNote, noDescription } from './ticket-tab-words.ts';

describe('the Ticket tab’s words (spec 013, Q10f)', () => {
  it('AC-9: says what Claude was sent and what it wasn’t', () => {
    expect(briefNote).toEqual({
      title: "Claude's brief",
      body: "Claude started from this ticket's title and description, as they were when the session started. Comments, linked issues and other fields weren't sent.",
    });
  });

  it('AC-9: says when the ticket has no description', () => {
    expect(noDescription).toBe('This ticket has no description.');
  });
});
