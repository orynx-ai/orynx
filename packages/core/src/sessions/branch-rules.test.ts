import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mostRuleCharacters, readBranchRules, rulesFrom } from './branch-rules.ts';

const made: string[] = [];
afterEach(async () => {
  await Promise.all(made.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

async function repoWith(files: Record<string, string>): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), 'branch-rules-'));
  made.push(repo);
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(repo, path, '..'), { recursive: true });
    await writeFile(join(repo, path), text);
  }
  return repo;
}

/** acme-app's own words, cut down: a skill's "Branch Naming" section, and a CLAUDE.md line about the key. */
const skill = `# Git workflow

Commit early.

### Branch Naming

\`\`\`
feature/<short-description>   → feature/task-creation
fix/<short-description>       → fix/duplicate-tasks
\`\`\`

## Working with Worktrees

git worktree add ../project-feature-a feature/task-creation
`;
const handbook = `# Handbook

Releases ride a weekly train: \`release/YY.MM.WW\` branches.

Every commit references a Jira ID; \`.husky/prepare-commit-msg\` prefills \`Refs: <ID>\` from branch name.
`;

describe('the repository’s branch rules (spec 042)', () => {
  it('AC-16: keeps a section headed about branches whole, and other paragraphs only when they say how branches are named', () => {
    const rules = rulesFrom([
      { path: '.claude/skills/git-workflow/SKILL.md', text: skill },
      { path: 'CLAUDE.md', text: handbook },
    ]);
    expect(rules).toContain('feature/<short-description>   → feature/task-creation');
    expect(rules).toContain('from branch name');
    expect(rules).not.toContain('Releases ride a weekly train');
    expect(rules).not.toContain('Working with Worktrees');
    expect(rules).not.toContain('Commit early');
  });

  it('AC-20: says nothing for a repository with no rules about branch names', () => {
    expect(rulesFrom([{ path: 'README.md', text: '# App\n\nRun `pnpm dev`.\n' }])).toBe('');
  });

  it('keeps to its limit', () => {
    const long = `## Branch names\n\n${'feature/x is how we name a branch. '.repeat(1000)}`;
    expect(rulesFrom([{ path: 'CONTRIBUTING.md', text: long }]).length).toBeLessThanOrEqual(mostRuleCharacters);
  });

  it('AC-16: reads CLAUDE.md, AGENTS.md, CONTRIBUTING.md and every skill, and names where each rule came from', async () => {
    const repo = await repoWith({
      '.claude/skills/git-workflow/SKILL.md': skill,
      '.claude/skills/forms/SKILL.md': '# Forms\n\nUse react-hook-form.\n',
      'CLAUDE.md': handbook,
      '.github/CONTRIBUTING.md': '## Branching\n\nName branches `<you>/<KEY>-<words>`.\n',
    });
    const rules = await readBranchRules(repo);
    expect(rules).toContain('From .claude/skills/git-workflow/SKILL.md:');
    expect(rules).toContain('From .github/CONTRIBUTING.md:');
    expect(rules).toContain('`<you>/<KEY>-<words>`');
    expect(rules).not.toContain('react-hook-form');
  });

  it('AC-20: a folder with none of those files has no rules', async () => {
    expect(await readBranchRules(await repoWith({}))).toBe('');
  });
});
