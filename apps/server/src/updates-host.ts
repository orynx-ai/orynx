import { OrynxVersionSchema } from '@devhub/contracts';
import { createCloneUpdater, type CloneService, type UpdateHost } from '@devhub/core';

export interface UpdateHostOptions {
  /** This hub runs inside the desktop app (spec 027), whose own updater installs updates. */
  desktop: boolean;
  /** DEVHUB_SERVICE: the service ./install.sh set up, or null for a clone started by hand. */
  service: CloneService;
  /** The version stamped into this build; a clone's says 0.1.0, so its version comes from git. */
  version: string;
  /** The clone the hub was built from. */
  repo: string;
  /** DEVHUB_HOME. */
  home: string;
  /** What git and ./install.sh run with. */
  env: Readonly<Record<string, string>>;
}

/** Which Orynx this is, and what Update does for it (spec 045, Assumptions). */
export async function updateHost({
  desktop,
  service,
  version,
  repo,
  home,
  env,
}: UpdateHostOptions): Promise<UpdateHost> {
  if (!desktop) return createCloneUpdater({ folder: repo, service, home, env });
  return {
    kind: 'desktop',
    folder: null,
    running: { release: OrynxVersionSchema.safeParse(version).data ?? null, commits: 0, commit: null },
    state: () => ({ action: 'none', update: { state: 'idle' } }),
    update: () => Promise.resolve(),
    restart: () => Promise.resolve(),
    watch: () => () => undefined,
  };
}
