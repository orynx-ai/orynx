import { looksLikeSecret } from '@devhub/contracts';

// The rule lives in the contracts since spec 022, where the composer uses it too.
export { looksLikeSecret };

/** The first of `paths` that looks like a secret, or null. */
export function firstSecretFile(paths: readonly string[]): string | null {
  return paths.find(looksLikeSecret) ?? null;
}
