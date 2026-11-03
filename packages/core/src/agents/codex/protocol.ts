import { z } from 'zod';

/**
 * The parts of `codex app-server`'s protocol Orynx reads (spec 052), from Codex 0.166's
 * `codex-rs/app-server-protocol`. Codex's JSON-RPC carries no `jsonrpc` field. Every shape keeps fields Orynx doesn't
 * read, so a newer Codex that adds some still parses.
 */

const RequestIdSchema = z.union([z.string(), z.number()]);

/** Codex's own request to Orynx: an approval, or a call to one of Orynx's tools. */
export const ServerRequestSchema = z.object({ id: RequestIdSchema, method: z.string(), params: z.unknown() });
export const NotificationSchema = z.object({ method: z.string(), params: z.unknown() });
export const ErrorAnswerSchema = z.object({
  id: RequestIdSchema,
  error: z.object({ code: z.number(), message: z.string() }),
});
export const ResultAnswerSchema = z.object({ id: RequestIdSchema, result: z.unknown() });
