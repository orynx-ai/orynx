import { createRequire } from 'node:module';

/**
 * The only file in DevHub that starts Claude Code (spec 010): the copy that ships inside
 * `@anthropic-ai/claude-agent-sdk`, never a `claude` found on the PATH (Q2c).
 */

const sdkPackage = '@anthropic-ai/claude-agent-sdk';

export interface SdkTarget {
  platform?: NodeJS.Platform | (string & {});
  arch?: string;
}

/**
 * Where the SDK's own Claude Code is for this computer, looked up the way the SDK looks it up: in the
 * platform package it installs beside itself (`@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`).
 * Nothing is run. Null when no package for this platform is installed.
 */
export function findSdkClaudeCode({ platform = process.platform, arch = process.arch }: SdkTarget = {}): string | null {
  // pnpm keeps the platform package beside the SDK, not beside core, so look from the SDK's folder.
  const fromSdk = createRequire(createRequire(import.meta.url).resolve(sdkPackage));
  const ext = platform === 'win32' ? '.exe' : '';
  const packages =
    platform === 'linux'
      ? [`${sdkPackage}-linux-${arch}`, `${sdkPackage}-linux-${arch}-musl`]
      : [`${sdkPackage}-${platform}-${arch}`];
  for (const name of packages) {
    try {
      return fromSdk.resolve(`${name}/claude${ext}`);
    } catch {
      // Not installed for this platform: try the next.
    }
  }
  return null;
}
