import { describe, expect, it } from 'vitest';
import { codexCheckArgs, codexSessionArgs } from './launch.ts';

const places = {
  platform: 'darwin' as const,
  worktree: '/Users/you/.devhub/worktrees/0123456789abcdef',
  devhubHome: '/Users/you/.devhub',
  home: '/Users/you',
  temporary: '/var/folders/x/T',
};

/** The `-c key=value` pairs, as a map. */
function overrides(args: readonly string[]): Map<string, string> {
  const pairs = new Map<string, string>();
  for (let index = 0; index < args.length; index++) {
    if (args[index] !== '-c') continue;
    const [key = '', ...value] = (args[index + 1] ?? '').split('=');
    pairs.set(key, value.join('='));
  }
  return pairs;
}

describe("Codex's launch (spec 052)", () => {
  it("AC-16: asks before every command and edit, answered by you alone, whatever Codex's own config says", () => {
    const set = overrides(codexSessionArgs(places));
    expect(codexSessionArgs(places)[0]).toBe('app-server');
    expect(set.get('approval_policy')).toBe('"untrusted"');
    // Never Codex's own reviewer, which could approve on your behalf.
    expect(set.get('approvals_reviewer')).toBe('"user"');
  });

  it('AC-16: runs none of your hooks, notify command, web search, sub-agents or analytics', () => {
    const set = overrides(codexSessionArgs(places));
    expect(set.get('features.hooks')).toBe('false');
    expect(set.get('notify')).toBe('[]');
    expect(set.get('web_search')).toBe('"disabled"');
    expect(set.get('features.multi_agent')).toBe('false');
    expect(set.get('analytics.enabled')).toBe('false');
    expect(set.get('check_for_update_on_startup')).toBe('false');
  });

  it('AC-15: sandboxes commands: they write only in the worktree and the temporary folder, with no network', () => {
    const set = overrides(codexSessionArgs(places));
    expect(set.get('default_permissions')).toBe('"orynx"');
    expect(set.get('permissions.orynx.network.enabled')).toBe('false');
    expect(set.get('permissions.orynx.filesystem')).toBe(
      '{":root"="read","/Users/you/.devhub"="deny","/Users/you/Library/Keychains"="deny","/Users/you/.codex"="deny",' +
        '"/Users/you/.devhub/worktrees/0123456789abcdef"="write","/var/folders/x/T"="write"}',
    );
  });

  it('AC-15: on Linux, hides the keyring folder instead', () => {
    const filesystem = overrides(codexSessionArgs({ ...places, platform: 'linux', home: '/home/you' })).get(
      'permissions.orynx.filesystem',
    );
    expect(filesystem).toContain('"/home/you/.local/share/keyrings"="deny"');
    expect(filesystem).toContain('"/home/you/.codex"="deny"');
  });

  it('an Ask only reads its folder, which may be your own checkout', () => {
    const filesystem = overrides(
      codexSessionArgs({ ...places, worktree: '/Users/you/code/web-app', readOnly: true }),
    ).get('permissions.orynx.filesystem');
    expect(filesystem).toContain('"/Users/you/code/web-app"="read"');
    expect(filesystem).not.toContain('"/Users/you/code/web-app"="write"');
  });

  it('writes a path with a quote or a backslash as one TOML string, so it can never add an entry', () => {
    const filesystem = overrides(codexSessionArgs({ ...places, worktree: '/tmp/a"="write","/b\\c' })).get(
      'permissions.orynx.filesystem',
    );
    expect(filesystem).toContain('"/tmp/a\\"=\\"write\\",\\"/b\\\\c"="write"');
  });

  it('the login check takes the same overrides, with no sandbox profile, since it runs nothing', () => {
    const set = overrides(codexCheckArgs);
    expect(codexCheckArgs[0]).toBe('app-server');
    expect(set.get('analytics.enabled')).toBe('false');
    expect(set.get('features.hooks')).toBe('false');
    expect(set.has('permissions.orynx.filesystem')).toBe(false);
  });
});
