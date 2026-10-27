import { z } from 'zod';
import { GitHubLinkSchema } from './github.ts';

/** Spec 045: the version you run, the releases on GitHub, and an update's progress, for Settings › About. */

/** `0.1.40`: a release's version, major.minor.patch, without its tag's `v`. */
export const OrynxVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
export type OrynxVersion = z.infer<typeof OrynxVersionSchema>;

/** One release as What's new lists it (AC-14). */
export const ReleaseSchema = z.object({
  version: OrynxVersionSchema,
  publishedAt: z.iso.datetime(),
  /** Its notes as Markdown, text from GitHub; empty when it has none (AC-17). */
  notes: z.string(),
  /** Its page on github.com. */
  url: GitHubLinkSchema,
  /** Newer than the version you run. */
  newer: z.boolean(),
  /** The version you run. */
  mine: z.boolean(),
});
export type Release = z.infer<typeof ReleaseSchema>;

/** The desktop app, a clone `./install.sh` runs as a service, or a clone started by hand (Assumptions). */
export const OrynxKindSchema = z.enum(['desktop', 'service', 'by_hand']);
export type OrynxKind = z.infer<typeof OrynxKindSchema>;

/** The version you run: the release, how many commits a clone is past it, and the clone's commit (AC-1, AC-2). */
export const RunningVersionSchema = z.object({
  /** Null for a clone with no release tag in its history. */
  release: OrynxVersionSchema.nullable(),
  commits: z.int().nonnegative(),
  /** The clone's short commit; null for the desktop app. */
  commit: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/)
    .nullable(),
});
export type RunningVersion = z.infer<typeof RunningVersionSchema>;

/**
 * What a newer release offers: Update (a Mac with a folder it can write, an installed clone), Download (a Mac that
 * can't write its folder, AC-21), the commands to run (a clone started by hand, AC-30), or nothing, while Linux's
 * updater downloads it on its own (AC-18).
 */
export const UpdateActionSchema = z.enum(['update', 'download', 'commands', 'none']);
export type UpdateAction = z.infer<typeof UpdateActionSchema>;

/** Why Update changed nothing in a clone (AC-27): changes of its own, or a branch that can't fast-forward. */
export const UpdateRefusalSchema = z.enum(['changes', 'diverged']);
export type UpdateRefusal = z.infer<typeof UpdateRefusalSchema>;

export const UpdateProgressSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('idle') }),
  /** The desktop app is downloading it (AC-18). */
  z.object({ state: z.literal('downloading'), version: OrynxVersionSchema }),
  /** Downloaded and checked: Restart to update (AC-19, AC-20). */
  z.object({ state: z.literal('ready'), version: OrynxVersionSchema }),
  /** A clone's `git pull` and `./install.sh` are running (AC-25). */
  z.object({ state: z.literal('updating') }),
  /** The download or the clone's update failed (AC-23, AC-28). `log` is the clone's update.log; null in the app. */
  z.object({ state: z.literal('failed'), log: z.string().nullable() }),
  z.object({ state: z.literal('refused'), reason: UpdateRefusalSchema }),
]);
export type UpdateProgress = z.infer<typeof UpdateProgressSchema>;

/** GET /api/updates: Settings › About's Version, Updates and What's new. */
export const UpdatesSchema = z.object({
  kind: OrynxKindSchema,
  /** The clone's folder as people read it (`~/Code/orynx`); null for the desktop app. */
  folder: z.string().nullable(),
  running: RunningVersionSchema,
  action: UpdateActionSchema,
  /** The hub is asking GitHub now (AC-8). */
  checking: z.boolean(),
  /** When GitHub last answered; null until it has (AC-6, AC-9). */
  checkedAt: z.iso.datetime().nullable(),
  /** The last check didn't get GitHub's answer (AC-10). */
  checkFailed: z.boolean(),
  /** The 10 newest releases, newest first (Q8). */
  releases: z.array(ReleaseSchema).max(10),
  update: UpdateProgressSchema,
  /** A session is working or waiting for you, so Update and Restart to update wait (AC-22, AC-29). */
  busy: z.boolean(),
});
export type Updates = z.infer<typeof UpdatesSchema>;

/** POST /api/updates/install: Update, or Restart to update once it's downloaded. Never a command of its own. */
export const UpdateInstallSchema = z.strictObject({ step: z.enum(['update', 'restart']) });
export type UpdateInstall = z.infer<typeof UpdateInstallSchema>;
