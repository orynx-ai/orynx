import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractImports,
  findBoundaryViolations,
  findPackageJsonViolations,
  packageForPath,
  packageNameOf,
} from './boundaries.ts';

function rules(path: string, content: string): string[] {
  return findBoundaryViolations(path, content).map((f) => f.rule);
}

describe('extractImports', () => {
  it('finds static, type, side-effect, re-export, dynamic and require imports with lines', () => {
    const src = [
      `import { a } from "a";`,
      `import type { B } from 'b';`,
      `import "./side.css";`,
      `import {`,
      `  c,`,
      `  d,`,
      `} from "c";`,
      `export * from "e";`,
      `export { f } from "f";`,
      `const g = await import("g");`,
      `const h = require("h");`,
      `// import x from "commented";`,
    ].join('\n');
    assert.deepEqual(
      extractImports(src).map((r) => `${r.specifier}@${r.line}`),
      ['a@1', 'b@2', './side.css@3', 'c@4', 'e@8', 'f@9', 'g@10', 'h@11'],
    );
  });
});

describe('packageNameOf / packageForPath', () => {
  it('names packages', () => {
    assert.equal(packageNameOf('@devhub/contracts/testing'), '@devhub/contracts');
    assert.equal(packageNameOf('zod/v4'), 'zod');
    assert.equal(packageNameOf('node:fs'), 'node:fs');
    assert.equal(packageNameOf('./x'), null);
    assert.equal(packageNameOf('virtual:pwa'), null);
  });

  it('maps paths to packages', () => {
    assert.equal(packageForPath('packages/api-client/src/client.ts'), 'api-client');
    assert.equal(packageForPath('apps/web/src/main.tsx'), 'web');
    assert.equal(packageForPath('scripts/run-gates.ts'), null);
  });
});

describe('findBoundaryViolations', () => {
  it('enforces the layering table', () => {
    assert.deepEqual(rules('packages/app/src/x.ts', `import { createServer } from "@devhub/core";`), ['layering']);
    assert.deepEqual(rules('packages/ui/src/x.tsx', `import { Status } from "@devhub/contracts";`), ['layering']);
    assert.deepEqual(rules('packages/core/src/x.ts', `import { Button } from "@devhub/ui";`), ['layering']);
    assert.deepEqual(
      rules(
        'packages/app/src/x.ts',
        `import { Button } from "@devhub/ui";\nimport { s } from "@devhub/contracts/testing";`,
      ),
      [],
    );
    assert.deepEqual(rules('apps/server/src/main.ts', `import { createServer } from "@devhub/core";`), []);
  });

  it('keeps Node and server libraries out of browser packages', () => {
    assert.deepEqual(rules('packages/app/src/x.ts', `import { readFile } from "node:fs";\nimport path from "path";`), [
      'node-in-browser',
      'node-in-browser',
    ]);
    assert.deepEqual(
      rules('packages/api-client/src/x.ts', `import Fastify from "fastify";\nimport { Octokit } from "@octokit/rest";`),
      ['server-lib-in-browser', 'server-lib-in-browser'],
    );
    assert.deepEqual(
      rules('packages/core/src/x.ts', `import { readFile } from "node:fs";\nimport Fastify from "fastify";`),
      [],
    );
  });

  it('keeps the Claude Agent SDK and the peers it brings out of browser packages (spec 010)', () => {
    assert.deepEqual(
      rules(
        'packages/app/src/x.ts',
        [
          'import { query } from "@anthropic-ai/claude-agent-sdk";',
          'import Anthropic from "@anthropic-ai/sdk";',
          'import { Client } from "@modelcontextprotocol/sdk/client/index.js";',
        ].join('\n'),
      ),
      ['server-lib-in-browser', 'server-lib-in-browser', 'server-lib-in-browser'],
    );
  });

  it('lets browser-package tests use Node built-ins', () => {
    assert.deepEqual(
      rules(
        'packages/app/src/test/server.ts',
        `import { setupServer } from "msw/node";\nimport { tmpdir } from "node:os";`,
      ),
      [],
    );
    assert.deepEqual(rules('packages/app/src/x.test.tsx', `import { join } from "node:path";`), []);
  });

  it('keeps react out of core', () => {
    assert.deepEqual(rules('packages/core/src/x.ts', `import { useState } from "react";`), ['layering']);
  });

  it('allows contracts to import only zod outside tests', () => {
    assert.deepEqual(
      rules('packages/contracts/src/status.ts', `import { z } from "zod";\nimport axios from "axios";`),
      ['contracts-deps'],
    );
    assert.deepEqual(rules('packages/contracts/src/status.test.ts', `import { describe } from "vitest";`), []);
  });

  it('flags unknown @devhub packages', () => {
    assert.deepEqual(rules('packages/app/src/x.ts', `import x from "@devhub/nope";`), ['unknown-package']);
  });
});

describe('findPackageJsonViolations', () => {
  it('checks @devhub dependencies against the table', () => {
    const json = { dependencies: { '@devhub/core': 'workspace:*', '@devhub/ui': 'workspace:*', react: '^19' } };
    assert.deepEqual(
      findPackageJsonViolations('packages/app/package.json', json).map((f) => f.message),
      ['@devhub/app must not depend on @devhub/core'],
    );
    assert.deepEqual(
      findPackageJsonViolations('packages/ui/package.json', { devDependencies: { '@devhub/ui': 'workspace:*' } }),
      [],
    );
  });
});
