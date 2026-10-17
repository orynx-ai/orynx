/**
 * Stands in for @napi-rs/keyring in `pnpm test` (see vitest.config.ts), so no unit test can reach
 * the real OS keychain by accident: loading it fails. Tests that need the library fake it with
 * vi.mock; `pnpm test:keychain` is the only run that uses the real one.
 */
throw new Error('Unit tests must not use the real OS keychain: fake @napi-rs/keyring, or run pnpm test:keychain.');

export {};
