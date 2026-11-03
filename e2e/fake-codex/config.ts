import { join } from 'node:path';

/** The fake Codex the Codex hub runs (spec 052); every other hub names one that isn't there, so it has no Codex. */
export const fakeCodex = join(import.meta.dirname, 'codex');
export const noCodex = '/nonexistent/orynx-e2e/codex';
