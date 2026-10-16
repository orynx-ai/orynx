import { RuleConfigSeverity, type UserConfig } from '@commitlint/types';

// Conventional Commits with a required kebab-case scope: a package (app, ui, core, …) or a feature (home, tickets, …).
const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      RuleConfigSeverity.Error,
      'always',
      ['build', 'chore', 'ci', 'docs', 'feat', 'fix', 'perf', 'refactor', 'revert', 'style', 'test'],
    ],
    'scope-empty': [RuleConfigSeverity.Error, 'never'],
    'scope-case': [RuleConfigSeverity.Error, 'always', 'kebab-case'],
    'body-max-line-length': [RuleConfigSeverity.Disabled],
  },
};

export default config;
