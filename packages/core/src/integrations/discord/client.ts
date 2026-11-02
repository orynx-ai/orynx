import { z } from 'zod';
import { networkCode } from '../github/client.ts';

/**
 * The only file in Orynx that talks to Discord (integration-adapter skill), over Node's own fetch against Discord's
 * REST API (spec 016, Q4). The bot's token goes into the Authorization header and nowhere else: a failure comes back
 * as a {@link DiscordProblem}, never as fetch's error.
 */

export type DiscordProblem =
  /** Discord refused the token. */
  | { kind: 'rejected' }
  /** The bot's Message Content intent is off, so Discord would send every message empty (AC-7). */
  | { kind: 'intent_off' }
  /** A team owns the bot's application, so Orynx can't tell whose mentions count without your user ID (AC-8). */
  | { kind: 'user_id_needed' }
  /** Discord's rate limit; `resetAt` is when to try again, in milliseconds, if Discord said. */
  | { kind: 'rate_limited'; resetAt: number | null }
  /** The request never got Discord's answer. `code` is safe to log, such as ENOTFOUND. */
  | { kind: 'unreachable'; code: string | undefined }
  | { kind: 'timeout' }
  /** Discord answered with an error that says nothing about the token. */
  | { kind: 'discord_error'; status: number };

export interface DiscordServer {
  id: string;
  name: string;
}

/** The bot, whose mentions it reads, and the servers it was added to (spec 016, AC-6). */
export type DiscordCheck =
  { ok: true; bot: string; userId: string; servers: DiscordServer[] } | { ok: false; problem: DiscordProblem };

export interface DiscordClient {
  /** Asks Discord about the bot: its name, its owner (or `userId` for a team's), Message Content, and its servers. */
  check(token: string, userId?: string): Promise<DiscordCheck>;
}

export interface DiscordClientOptions {
  timeoutMs?: number;
  now?: () => number;
}

export const discordApi = 'https://discord.com/api/v10';
/** The application's flags for Message Content: on, or on until the bot is verified. */
const messageContentFlags = (1 << 18) | (1 << 19);

const BotSchema = z.object({ username: z.string().min(1) });
const ApplicationSchema = z.object({
  flags: z.int().catch(0),
  owner: z.object({ id: z.string() }).nullish(),
  team: z.object({ id: z.string() }).nullish(),
});
const ServersSchema = z.array(z.object({ id: z.string(), name: z.string() }));

/** A failed call, carrying what Discord said; the message never holds the request. */
class DiscordFailure extends Error {
  readonly problem: DiscordProblem;

  constructor(problem: DiscordProblem) {
    super(problem.kind);
    this.problem = problem;
  }
}

export function createDiscordClient({ timeoutMs = 10_000, now = Date.now }: DiscordClientOptions = {}): DiscordClient {
  async function get<T extends z.ZodType>(token: string, path: string, schema: T): Promise<z.infer<T>> {
    let response: Response;
    try {
      response = await fetch(`${discordApi}${path}`, {
        headers: { authorization: `Bot ${token}`, 'user-agent': 'Orynx (https://orynx.local, 1)' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new DiscordFailure(timedOut ? { kind: 'timeout' } : { kind: 'unreachable', code: networkCode(error) });
    }
    if (response.status === 401) throw new DiscordFailure({ kind: 'rejected' });
    if (response.status === 429) throw new DiscordFailure({ kind: 'rate_limited', resetAt: await resetOf(response) });
    if (!response.ok) throw new DiscordFailure({ kind: 'discord_error', status: response.status });
    const read = schema.safeParse(await response.json().catch(() => null));
    if (!read.success) throw new DiscordFailure({ kind: 'discord_error', status: response.status });
    return read.data;
  }

  /** When to try again: Discord's `retry_after` seconds, else its Retry-After header. */
  async function resetOf(response: Response): Promise<number | null> {
    const body: unknown = await response.json().catch(() => null);
    const seconds =
      typeof body === 'object' && body !== null && 'retry_after' in body && typeof body.retry_after === 'number'
        ? body.retry_after
        : Number(response.headers.get('retry-after'));
    return Number.isFinite(seconds) && seconds >= 0 ? now() + Math.round(seconds * 1000) : null;
  }

  return {
    async check(token, userId) {
      try {
        const bot = await get(token, '/users/@me', BotSchema);
        const application = await get(token, '/applications/@me', ApplicationSchema);
        if ((application.flags & messageContentFlags) === 0) return { ok: false, problem: { kind: 'intent_off' } };
        const owner = application.team == null ? application.owner?.id : undefined;
        const you = userId ?? owner;
        if (you === undefined) return { ok: false, problem: { kind: 'user_id_needed' } };
        const servers = await get(token, '/users/@me/guilds', ServersSchema);
        return { ok: true, bot: bot.username, userId: you, servers };
      } catch (error) {
        if (error instanceof DiscordFailure) return { ok: false, problem: error.problem };
        throw error;
      }
    },
  };
}
