import { describe, expect, it } from 'vitest';
import {
  AddRepositoryRequestSchema,
  apiRoutes,
  ApiErrorSchema,
  maxRepositories,
  RepositoryListSchema,
  RepositorySchema,
} from './index.ts';
import { makeRepository } from './testing.ts';

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }): string | undefined {
  return result.error?.issues[0]?.message;
}

describe('RepositorySchema', () => {
  it('AC-6: describes a folder by id, real path, name, ~ path and Jira project', () => {
    const folder = makeRepository();
    expect(RepositorySchema.parse(folder)).toEqual({
      id: '0123456789abcdef',
      path: '/Users/dev/code/intranet-web',
      name: 'intranet-web',
      displayPath: '~/code/intranet-web',
      jiraProject: 'PROJ',
      found: true,
    });
    expect(makeRepository({ jiraProject: null }).jiraProject).toBeNull();
  });

  it('AC-16 (spec 048): says when the folder is gone, and an answer from before 048 reads as found', () => {
    expect(RepositorySchema.parse(makeRepository({ found: false })).found).toBe(false);
    const { found: _found, ...older } = makeRepository();
    expect(RepositorySchema.parse(older).found).toBe(true);
  });

  it('wraps the list, in the order the folders were added', () => {
    const list = { repositories: [makeRepository(), makeRepository({ id: 'fedcba9876543210', name: 'mobile' })] };
    expect(RepositoryListSchema.parse(list)).toEqual(list);
  });

  it('holds at most 100 folders', () => {
    expect(maxRepositories).toBe(100);
  });
});

describe('AddRepositoryRequestSchema', () => {
  it('AC-6: takes a path with ~ or in full, trimmed, and a Jira project or none', () => {
    expect(AddRepositoryRequestSchema.parse({ path: ' ~/code/app ', jiraProject: 'PROJ' })).toEqual({
      path: '~/code/app',
      jiraProject: 'PROJ',
    });
    expect(AddRepositoryRequestSchema.parse({ path: '/opt/code/app', jiraProject: null }).jiraProject).toBeNull();
  });

  it('AC-7: asks for a path when the field is empty', () => {
    expect(firstMessage(AddRepositoryRequestSchema.safeParse({ path: '  ', jiraProject: null }))).toBe(
      "Enter the folder's path.",
    );
  });

  it('AC-7: asks for a full path when it does not start with / or ~', () => {
    for (const path of ['code/app', './app', '~someone/app']) {
      expect(firstMessage(AddRepositoryRequestSchema.safeParse({ path, jiraProject: null })), path).toBe(
        'Enter the full path, starting with / or ~.',
      );
    }
  });

  it('refuses a Jira project key Jira would never make', () => {
    for (const jiraProject of ['proj', '1PROJ', 'PR-OJ', '']) {
      expect(AddRepositoryRequestSchema.safeParse({ path: '~/code/app', jiraProject }).success, jiraProject).toBe(
        false,
      );
    }
  });

  it('lives at /api/repositories, with one folder at /api/repositories/:id', () => {
    expect(apiRoutes.repositories).toBe('/api/repositories');
    expect(apiRoutes.repository).toBe('/api/repositories/:id');
  });
});

describe('the folder_rejected error', () => {
  it('AC-7: is a code the server can send, for a folder the form must show under Folder', () => {
    const body = { code: 'folder_rejected', message: 'This folder is already in the list.' };
    expect(ApiErrorSchema.parse(body)).toEqual(body);
  });
});
