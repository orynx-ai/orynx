import js from '@eslint/js';
import pluginQuery from '@tanstack/eslint-plugin-query';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import storybook from 'eslint-plugin-storybook';
import type { Linter } from 'eslint';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const browserCode = ['packages/ui/**/*.{ts,tsx}', 'packages/app/**/*.{ts,tsx}', 'apps/web/**/*.{ts,tsx}'];

export default defineConfig(
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/storybook-static/**',
    '**/coverage/**',
    'playwright-report/**',
    'test-results/**',
    'docs/design/**',
  ]),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './packages/*/tsconfig.json', './apps/*/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // Repo scripts and config files run in Node and may print.
  {
    files: ['scripts/**/*.ts', '*.config.ts', 'packages/*/*.config.ts', 'apps/*/*.config.ts', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },

  // node:test's describe/it return promises the runner awaits itself.
  {
    files: ['scripts/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          allowForKnownSafeCalls: [
            { from: 'package', package: 'node:test', name: ['describe', 'it', 'test', 'suite'] },
          ],
        },
      ],
    },
  },

  // Browser code: React rules, accessibility, TanStack Query.
  {
    files: browserCode,
    ...reactHooks.configs.flat['recommended-latest'],
  },
  {
    files: browserCode,
    ...jsxA11y.flatConfigs.strict,
    languageOptions: { globals: globals.browser },
  },
  ...pluginQuery.configs['flat/recommended'],
  {
    files: browserCode,
    ignores: ['**/*.test.{ts,tsx}', '**/src/test/**'],
    rules: {
      // CLAUDE.md rule 3: all HTTP goes through @devhub/api-client.
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'axios', message: 'All HTTP goes through @devhub/api-client (CLAUDE.md rule 3).' }],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'All HTTP goes through @devhub/api-client (CLAUDE.md rule 3).' },
        { name: 'EventSource', message: 'Use api.subscribe() from @devhub/api-client (CLAUDE.md rule 3).' },
      ],
    },
  },

  // The plugin's types leave `files` undefined, which exactOptionalPropertyTypes rejects.
  ...(storybook.configs['flat/recommended'] as unknown as Linter.Config[]),
);
