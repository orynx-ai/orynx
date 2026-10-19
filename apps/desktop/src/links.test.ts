import { describe, expect, it } from 'vitest';
import { navigationAction, newWindowAction } from './links.ts';

const hub = 'http://127.0.0.1:61454';

describe('newWindowAction', () => {
  it('AC-13: sends a Jira or GitHub link the page opens to the default browser', () => {
    expect(newWindowAction('https://your-team.atlassian.net/browse/WEB-12')).toBe('external');
    expect(newWindowAction('https://github.com/acme/web/pull/7')).toBe('external');
  });

  it('AC-15: refuses a new window for anything that is not https', () => {
    for (const url of ['http://example.com', 'file:///etc/passwd', `${hub}/settings`, 'javascript:alert(1)', 'nope']) {
      expect(newWindowAction(url)).toBe('deny');
    }
  });
});

describe('navigationAction', () => {
  it("AC-3: lets the window move within the hub's own page", () => {
    expect(navigationAction(`${hub}/tickets`, hub)).toBe('allow');
    expect(navigationAction(`${hub}/`, hub)).toBe('allow');
  });

  it('AC-14: hands Open in VS Code or Cursor to the OS', () => {
    expect(navigationAction('vscode://file/Users/you/.devhub/worktrees/web-12', hub)).toBe('external');
    expect(navigationAction('cursor://file/Users/you/.devhub/worktrees/web-12', hub)).toBe('external');
  });

  it('AC-15: refuses every other address, including another port on this computer', () => {
    for (const url of [
      'https://example.com',
      'http://127.0.0.1:4317/',
      'http://localhost:61454/',
      'file:///Users/you/notes.txt',
      'nope',
    ]) {
      expect(navigationAction(url, hub)).toBe('deny');
    }
  });
});
