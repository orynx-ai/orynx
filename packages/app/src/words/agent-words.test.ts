import { describe, expect, it } from 'vitest';
import { forAgent } from './agent-words.ts';

describe('forAgent (spec 052, Q4)', () => {
  it.each([
    ['Send to Claude', 'Send to Codex'],
    ["Claude's brief", "Codex's brief"],
    ["Claude Code isn't signed in.", "Codex isn't signed in."],
    ['Review web-app #2841 with Claude', 'Review web-app #2841 with Codex'],
    ['Nothing to name', 'Nothing to name'],
  ])('says %j as %j for a Codex session', (claude, codex) => {
    expect(forAgent(claude, 'codex')).toBe(codex);
  });

  it("leaves Claude's words as they are", () => {
    expect(forAgent("Claude Code isn't signed in.", 'claude')).toBe("Claude Code isn't signed in.");
  });
});
