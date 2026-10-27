import {
  OrynxVersionSchema,
  type OrynxKind,
  type OrynxVersion,
  type RunningVersion,
  type UpdateAction,
  type UpdateInstall,
  type UpdateProgress,
  type Updates,
} from '@devhub/contracts';
import type { EventBus } from '../events/event-bus.ts';
import type { ReleasesClient, ReleasesProblem } from '../integrations/releases/client.ts';
import { publishedReleases, type PublishedRelease } from '../integrations/releases/map.ts';
import type { SessionStore } from '../sessions/session-store.ts';
import type { SettingsStore } from '../settings/settings-store.ts';
import { compareVersions, isNewer } from './versions.ts';

/**
 * What the host gives the update service (spec 045): which Orynx it is, the version it runs, and what Update and
 * Restart to update do. The desktop app's comes from Electron's updater; an installed clone's runs git and
 * `./install.sh`; a clone started by hand offers only the commands.
 */
export interface UpdateHost {
  kind: OrynxKind;
  /** The clone's folder as people read it; null for the desktop app. */
  folder: string | null;
  running: RunningVersion;
  /** What a newer release offers now, and how far an update has got. */
  state(): { action: UpdateAction; update: UpdateProgress };
  /** Update pressed for this version: the Mac downloads it, an installed clone pulls and installs it. */
  update(version: OrynxVersion): Promise<void>;
  /** Restart to update, once `state()` says the update is ready. */
  restart(): Promise<void>;
  /** Calls `changed` each time `state()` changes. Returns a stop. */
  watch(changed: () => void): () => void;
}

/** Update or Restart to update refused: a session is running, or there is nothing to do (routes answer 409). */
export class UpdateRefusedError extends Error {
  readonly code: 'session_working' | 'update_unavailable';

  constructor(code: UpdateRefusedError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'UpdateRefusedError';
  }
}

export interface UpdateService {
  /** The last answer, as Settings › About shows it; never asks GitHub. */
  read(): Promise<Updates>;
  /** Asks GitHub, unless it was asked less than a minute ago (AC-9), and answers once it has. */
  check(): Promise<Updates>;
  install(step: UpdateInstall['step']): Promise<Updates>;
  /** Checks now and every 6 hours, and says when the host's update moves on (AC-12). Returns a stop. */
  start(): () => void;
}

export interface UpdateServiceOptions {
  host: UpdateHost;
  releases: ReleasesClient;
  sessions: SessionStore;
  /** Where the newest version told about is kept (`settings.json`), so it's told once (AC-13). */
  settings: SettingsStore;
  events: EventBus;
  /** Tells the bell a newer version is out. */
  notify: (version: OrynxVersion) => void;
  /** A warning for the hub's log: why a check failed. */
  log: (line: string) => void;
  now?: () => number;
}

const minute = 60_000;
const everySixHours = 6 * 60 * minute;

/** What the log says after "couldn't check for updates": GitHub's status, or why there was none. */
function reasonOf(problem: ReleasesProblem): string {
  switch (problem.kind) {
    case 'rate_limited':
      return problem.resetAt === null
        ? 'rate limited'
        : `rate limited until ${new Date(problem.resetAt).toISOString()}`;
    case 'unreachable':
      return problem.code ?? 'unreachable';
    case 'timeout':
      return 'timeout';
    case 'github_error':
      return String(problem.status);
  }
}

export function createUpdateService({
  host,
  releases,
  sessions,
  settings,
  events,
  notify,
  log,
  now = Date.now,
}: UpdateServiceOptions): UpdateService {
  // Kept in memory only, never saved (Assumptions).
  let found: PublishedRelease[] = [];
  let checkedAt: number | null = null;
  let askedAt: number | null = null;
  let checkFailed = false;
  let asking: Promise<void> | null = null;

  function changed(): void {
    events.publish({ type: 'updates.changed' });
  }

  async function busy(): Promise<boolean> {
    return (await sessions.list()).some((session) => session.state === 'working' || session.state === 'needs_you');
  }

  /** One notification per newer version, never again for one already told about (AC-13). */
  async function tellOnce(): Promise<void> {
    const newest = found[0]?.version;
    if (newest === undefined || !isNewer(newest, host.running.release)) return;
    const told = OrynxVersionSchema.safeParse((await settings.read()).updates?.['told']);
    if (told.success && compareVersions(newest, told.data) <= 0) return;
    await settings.update((current) => ({ ...current, updates: { ...current.updates, told: newest } }));
    notify(newest);
  }

  async function ask(): Promise<void> {
    const answer = await releases.releases();
    if (answer.ok) {
      found = publishedReleases(answer.releases);
      checkedAt = now();
      checkFailed = false;
      await tellOnce().catch((error: unknown) => {
        log(
          `Orynx couldn't keep which update it told you about (${error instanceof Error ? error.message : 'unknown'}).`,
        );
      });
    } else {
      checkFailed = true;
      log(`Orynx couldn't check for updates (${reasonOf(answer.problem)}).`);
    }
  }

  function asked(): Promise<void> {
    if (asking !== null) return asking;
    if (askedAt !== null && now() - askedAt < minute) return Promise.resolve();
    askedAt = now();
    asking = ask().finally(() => {
      asking = null;
      changed();
    });
    changed();
    return asking;
  }

  async function read(): Promise<Updates> {
    const { action, update } = host.state();
    const { running } = host;
    return {
      kind: host.kind,
      folder: host.folder,
      running,
      action,
      checking: asking !== null,
      checkedAt: checkedAt === null ? null : new Date(checkedAt).toISOString(),
      checkFailed,
      releases: found.map((release) => ({
        ...release,
        newer: isNewer(release.version, running.release),
        mine: release.version === running.release,
      })),
      update,
      busy: await busy(),
    };
  }

  const nothingToDo = () => new UpdateRefusedError('update_unavailable', 'There is no update to install.');

  return {
    read,

    async check() {
      await asked();
      return read();
    },

    async install(step) {
      if (await busy()) throw new UpdateRefusedError('session_working', 'Stop the running sessions first.');
      const { action, update } = host.state();
      if (step === 'restart') {
        if (update.state !== 'ready') throw nothingToDo();
        await host.restart();
      } else {
        const newest = found[0];
        const moving = update.state === 'downloading' || update.state === 'ready' || update.state === 'updating';
        // Try again after a failure, even where the update downloads on its own (Linux's AppImage, AC-23).
        const offered = action === 'update' || update.state === 'failed';
        if (!offered || moving || newest === undefined || !isNewer(newest.version, host.running.release)) {
          throw nothingToDo();
        }
        await host.update(newest.version);
      }
      return read();
    },

    start() {
      const unwatch = host.watch(changed);
      void asked();
      const timer = setInterval(() => void asked(), everySixHours);
      timer.unref();
      return () => {
        clearInterval(timer);
        unwatch();
      };
    },
  };
}
