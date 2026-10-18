import { describe, expect, it } from 'vitest';
import { githubRepository } from './github-remote.ts';

describe('githubRepository (spec 014)', () => {
  it.each([
    ['https://github.com/acme/web-app.git', 'acme/web-app'],
    ['https://github.com/acme/web-app', 'acme/web-app'],
    ['https://github.com/acme/web-app/', 'acme/web-app'],
    ['https://github.com/acme/web-app.git/', 'acme/web-app'],
    ['HTTPS://GitHub.COM/Acme/Web-App.git', 'Acme/Web-App'],
    ['http://github.com/acme/web-app.git', 'acme/web-app'],
    ['https://github.com:443/acme/web-app.git', 'acme/web-app'],
    ['https://octocat:fake-token-for-tests@github.com/acme/web-app.git', 'acme/web-app'],
    ['git@github.com:acme/web-app.git', 'acme/web-app'],
    ['git@github.com:acme/web-app', 'acme/web-app'],
    ['github.com:acme/web-app.git', 'acme/web-app'],
    ['ssh://git@github.com/acme/web-app.git', 'acme/web-app'],
    ['ssh://git@github.com:22/acme/web-app.git', 'acme/web-app'],
    ['ssh://git@ssh.github.com:443/acme/web-app.git', 'acme/web-app'],
    ['git://github.com/acme/web-app.git', 'acme/web-app'],
    ['  git@github.com:acme/my.repo_name-2.git\n', 'acme/my.repo_name-2'],
  ])('AC-2: reads %s as %s', (address, repository) => {
    expect(githubRepository(address)).toBe(repository);
  });

  it.each([
    ['GitHub Enterprise', 'https://github.example.com/acme/web-app.git'],
    ['GitLab', 'git@gitlab.com:acme/web-app.git'],
    ['an SSH host alias', 'git@github-work:acme/web-app.git'],
    ['a host that only starts like GitHub', 'https://github.com.evil.example/acme/web-app.git'],
    ['a local path', '/Users/you/code/origin.git'],
    ['a relative path', '../origin.git'],
    ['a file address', 'file:///Users/you/code/origin.git'],
    ['an owner without a repository', 'https://github.com/acme'],
    ['a page inside a repository', 'https://github.com/acme/web-app/pulls'],
    ['an owner GitHub would refuse', 'https://github.com/-acme/web-app.git'],
    ['a repository called ..', 'git@github.com:acme/...git'],
    ['another port for https', 'https://github.com:8443/acme/web-app.git'],
    ['an escaped name', 'https://github.com/acme/web%2Fapp.git'],
    ["an address URL can't read", 'https://github.com:99999/acme/web-app.git'],
    ['nothing', ''],
  ])("AC-7: doesn't take %s as a repository on github.com", (_what, address) => {
    expect(githubRepository(address)).toBeNull();
  });
});
