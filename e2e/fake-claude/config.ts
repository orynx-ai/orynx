import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fakeToolsHubPort } from '../fake-tools/config.ts';

/** The fake Claude Code every e2e hub runs instead of the real one (spec 010, AC-12). */
export const fakeClaude = join(import.meta.dirname, 'claude');

/**
 * The second hub's CLAUDE_CONFIG_DIR, where a spec tells the fake Claude Code what to answer. The first
 * hub has none, so its Claude is always signed out, as shell.spec.ts expects. A fixed name, because
 * Playwright loads its config once per worker.
 */
export const fakeClaudeDir = join(tmpdir(), `devhub-e2e-claude-${String(fakeToolsHubPort)}`);

const answerFile = join(fakeClaudeDir, 'fake-auth-status.json');

/** What the second hub's fake Claude Code says from its next check on. */
export async function answerClaudeAs(answer: 'signed_in' | 'signed_out' | 'unreadable'): Promise<void> {
  if (answer === 'signed_out') {
    await rm(answerFile, { force: true });
    return;
  }
  await mkdir(fakeClaudeDir, { recursive: true });
  const status = {
    loggedIn: true,
    authMethod: 'claude.ai',
    apiProvider: 'firstParty',
    email: 'you@company.com',
    orgName: 'Company',
  };
  await writeFile(answerFile, answer === 'signed_in' ? JSON.stringify(status, null, 2) : 'Something went wrong\n');
}
