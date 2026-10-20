import { z } from 'zod';

/**
 * The session's Ports tab (spec 042): what listens from the session, and only that (Q8). A port is the session's
 * when its program runs in one of the session's Terminal tabs, or runs from inside its worktree.
 */

const PortNumberSchema = z.int().min(1).max(65_535);

/**
 * One port that listens. `url` is the address that answered HTTP or HTTPS, or null for anything else (a database).
 * `name` is a known program's name ("PostgreSQL"). `startedBy`: Claude through Orynx, you in a Terminal tab, or
 * found in the worktree, started some other way. Only one Orynx started can be restarted.
 */
export const SessionPortSchema = z.object({
  port: PortNumberSchema,
  pid: z.int().positive(),
  program: z.string().min(1),
  command: z.string().min(1),
  name: z.string().min(1).nullable(),
  url: z.url({ protocol: /^https?$/, hostname: /^localhost$/ }).nullable(),
  startedBy: z.enum(['claude', 'you', 'found']),
  since: z.iso.datetime(),
  restartable: z.boolean(),
});
export type SessionPort = z.infer<typeof SessionPortSchema>;

/** GET /api/sessions/:id/ports: lowest port first. */
export const SessionPortsSchema = z.object({ ports: z.array(SessionPortSchema) });
export type SessionPorts = z.infer<typeof SessionPortsSchema>;

/** The `:port` of a stop or a restart. */
export const SessionPortParamsSchema = z.object({
  id: z.string().min(1),
  port: z.coerce.number().pipe(PortNumberSchema),
});

/**
 * POST /api/sessions/:id/ports/:port/stop and /restart. `gone`: nothing of this session's listens there now, so
 * nothing was done. `cannot_restart`: Orynx didn't start it, so it doesn't know how.
 */
export const PortActionAnswerSchema = z.object({ result: z.enum(['done', 'gone', 'cannot_restart']) });
export type PortActionAnswer = z.infer<typeof PortActionAnswerSchema>;
