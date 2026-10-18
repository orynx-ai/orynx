/**
 * Files that look like secrets by their name (spec 014, Q6): `.env` and `.env.*` other than `.env.example`, keys
 * and certificates (`*.pem`, `*.key`), and SSH keys (`id_rsa*`, `id_ed25519*`), in any folder. A new one stops
 * the commit before anything is pushed, because a pushed secret can't be taken back.
 */
const secretNames = [/^\.env$/i, /^\.env\..+$/i, /\.pem$/i, /\.key$/i, /^id_rsa/i, /^id_ed25519/i];
const allowedNames = [/^\.env\.example$/i];

export function looksLikeSecret(path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return secretNames.some((pattern) => pattern.test(name)) && !allowedNames.some((pattern) => pattern.test(name));
}

/** The first of `paths` that looks like a secret, or null. */
export function firstSecretFile(paths: readonly string[]): string | null {
  return paths.find(looksLikeSecret) ?? null;
}
