import { z } from 'zod';

/**
 * Where a Claude session is, as the sidebar shows it (spec: "Session states").
 * Each state is shown with an icon shape, a word and a colour, never colour alone.
 */
export const SessionStateSchema = z.enum(['working', 'needs_you', 'done', 'pr_open', 'stopped']);
export type SessionState = z.infer<typeof SessionStateSchema>;

/** The five steps of a session (spec: "Agent sessions"). */
export const SessionStepSchema = z.enum(['plan', 'build', 'test', 'review', 'pull_request']);
export type SessionStep = z.infer<typeof SessionStepSchema>;
