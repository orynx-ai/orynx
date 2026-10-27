import { createCloneUpdater, type CloneService, type UpdateHost } from '@devhub/core';
import { desktopUpdateHost, type ParentPort } from './desktop-updates.ts';

export interface UpdateHostOptions {
  /** The port to the desktop app (spec 027) when this hub runs inside it, whose own updater installs updates. */
  desktop: ParentPort | null;
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
  /** A warning for the hub's log. */
  log: (line: string) => void;
}

/** Which Orynx this is, and what Update does for it (spec 045, Assumptions). */
export function updateHost({
  desktop,
  service,
  version,
  repo,
  home,
  env,
  log,
}: UpdateHostOptions): Promise<UpdateHost> {
  if (desktop !== null) return Promise.resolve(desktopUpdateHost({ port: desktop, version, log }));
  return createCloneUpdater({ folder: repo, service, home, env });
}
