import type { Finding, Gate } from '../lib/gate.ts';
import {
  findBoundaryViolations,
  findPackageJsonViolations,
  isKnownWorkspaceDir,
  workspaceDirOf,
} from '../lib/policies/boundaries.ts';

const SOURCE = /^(?:packages|apps)\/[^/]+\/src\/.+\.[cm]?[jt]sx?$/;
const PACKAGE_JSON = /^(?:packages|apps)\/[^/]+\/package\.json$/;

const gate: Gate = {
  id: 'boundaries',
  description: 'Imports flow one way between workspace packages; browser code never imports Node or server code',
  mode: 'fail',
  when: 'always',
  run(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.files) {
      if (PACKAGE_JSON.test(file)) {
        const dir = workspaceDirOf(file);
        if (dir !== null && !isKnownWorkspaceDir(dir)) {
          findings.push({
            file,
            line: 0,
            rule: 'unknown-package',
            message: `${dir} is not in the layering table`,
            fix: 'add it to docs/architecture.md (Packages) and LAYERS in scripts/lib/policies/boundaries.ts, then say what it may import',
          });
          continue;
        }
        let json: unknown;
        try {
          json = JSON.parse(ctx.read(file));
        } catch {
          findings.push({
            file,
            line: 0,
            rule: 'invalid-json',
            message: 'package.json does not parse',
            fix: 'fix the JSON',
          });
          continue;
        }
        findings.push(...findPackageJsonViolations(file, json));
      } else if (SOURCE.test(file)) {
        findings.push(...findBoundaryViolations(file, ctx.read(file)));
      }
    }
    return findings;
  },
};

export default gate;
