import { describe, expect, it } from 'vitest';
import { briefText, sessionNote, ticketBrief } from './brief.ts';

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
  it('AC-3 (Q5): says where Claude works and what it may not do, word for word', () => {
    expect(sessionNote('feat/PROJ-1423')).toBe(
      "You're working in a separate git worktree on the branch feat/PROJ-1423. Make the change the ticket asks for. " +
        'If the repository has a CLAUDE.md, read it first. ' +
        "Don't push, open pull requests or change git settings. " +
        "You can't run commands in this version, so say which ones you'd run to check your work. " +
        "When you're done, summarise what you changed in a few sentences.",
    );
  });
});
