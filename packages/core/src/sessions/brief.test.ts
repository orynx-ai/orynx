import { describe, expect, it } from 'vitest';
import { briefText, sessionNote, ticketBrief, ticketFromBrief } from './brief.ts';

const issue = {
  key: 'PROJ-1423',
  summary: 'Add bulk archive to the content list',
  type: 'Story',
  description: 'Content managers need to archive many items at once.\n\n- Checkbox on each row',
};

describe('the brief', () => {
  it('AC-3 (Q5): is the ticket, exactly: its key, type and summary, a blank line, then the description', () => {
    expect(briefText(ticketBrief(issue))).toBe(
      'Jira ticket PROJ-1423 (Story): Add bulk archive to the content list\n\n' +
        'Content managers need to archive many items at once.\n\n- Checkbox on each row',
    );
  });

  it('AC-3 (Q5): says "No description." when the ticket has none', () => {
    expect(briefText(ticketBrief({ ...issue, description: null }))).toBe(
      'Jira ticket PROJ-1423 (Story): Add bulk archive to the content list\n\nNo description.',
    );
  });

  it('AC-3: leaves the type out when Jira gives none', () => {
    expect(briefText(ticketBrief({ ...issue, type: null, description: null }))).toBe(
      'Jira ticket PROJ-1423: Add bulk archive to the content list\n\nNo description.',
    );
  });

  it('AC-3: holds the ticket as its one context chip, and no message of yours', () => {
    expect(ticketBrief(issue)).toEqual({
      message: '',
      context: [
        {
          kind: 'jira',
          title: 'Jira ticket PROJ-1423 (Story): Add bulk archive to the content list',
          body: issue.description,
        },
      ],
    });
  });

  it('puts your message first when there is one, as the composer will (spec 015)', () => {
    expect(briefText({ ...ticketBrief(issue), message: 'Keep it small.' })).toMatch(
      /^Keep it small\.\n\nJira ticket PROJ-1423 \(Story\)/,
    );
  });
});

describe('the note added to Claude Code’s system prompt', () => {
  it('AC-3 (011 Q5, 012 Q8g, 013 Q2a): says where Claude works, what it may not do, and that commands may wait, word for word', () => {
    expect(sessionNote('feat/PROJ-1423', true)).toBe(
      "You're working in a separate git worktree on the branch feat/PROJ-1423. Make the change the ticket asks for. " +
        'If the repository has a CLAUDE.md, read it first. ' +
        "Don't push, open pull requests or change git settings. " +
        'You can run commands in the worktree. ' +
        "They run in a sandbox with no network, and some wait for the user's approval. " +
        "Run the project's tests and checks before you finish. " +
        "When you're done, summarise what you changed and which checks you ran, in a few sentences. " +
        'If you need a decision from the user, finish and ask it in your summary. The user answers in a follow-up.',
    );
  });

  it('012 AC-20: where commands can’t run, says so, and asks which ones Claude would run', () => {
    expect(sessionNote('feat/PROJ-1423', false)).toBe(
      "You're working in a separate git worktree on the branch feat/PROJ-1423. Make the change the ticket asks for. " +
        'If the repository has a CLAUDE.md, read it first. ' +
        "Don't push, open pull requests or change git settings. " +
        "You can't run commands on this computer, so say which ones you'd run to check your work. " +
        "When you're done, summarise what you changed in a few sentences. " +
        'If you need a decision from the user, finish and ask it in your summary. The user answers in a follow-up.',
    );
  });
});

describe('ticketFromBrief (spec 013)', () => {
  it('AC-9: reads the type and description back from a brief saved before spec 013 kept the ticket', () => {
    const issue = {
      key: 'PROJ-1423',
      summary: 'Add bulk archive',
      type: 'Story',
      description: 'Content managers…\n\n- one',
    };
    expect(ticketFromBrief(briefText(ticketBrief(issue)))).toEqual({
      type: 'Story',
      description: 'Content managers…\n\n- one',
    });
  });

  it('AC-9: reads no type and no description as none', () => {
    const issue = { key: 'PROJ-1423', summary: 'Fix (again): the toolbar', type: null, description: null };
    expect(ticketFromBrief(briefText(ticketBrief(issue)))).toEqual({ type: null, description: null });
  });

  it('reads nothing from a brief that isn’t a ticket’s', () => {
    expect(ticketFromBrief('Fix the toolbar')).toBeNull();
  });
});
