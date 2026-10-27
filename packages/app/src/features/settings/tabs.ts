import { z } from 'zod';

/**
 * Settings tabs, in the product spec's order with Skills after Coding agent (spec 023), Notifications after Skills
 * (spec 029) and About last (spec 045); each is part of the address (`/settings/coding-agent`).
 */
export const SettingsTabSchema = z.enum([
  'connections',
  'coding-agent',
  'skills',
  'notifications',
  'repositories',
  'inbox-rules',
  'about',
]);
export type SettingsTab = z.infer<typeof SettingsTabSchema>;

export const settingsTabLabels: Record<SettingsTab, string> = {
  connections: 'Connections',
  'coding-agent': 'Coding agent',
  skills: 'Skills',
  notifications: 'Notifications',
  repositories: 'Repositories',
  'inbox-rules': 'Inbox rules',
  about: 'About',
};

/**
 * What Settings › Skills has open, in the address so every way of leaving a skill goes through the router, which
 * asks before unsaved changes are lost (spec 023, AC-11): `?skill=bug-bash`, or `?new=true` for New skill. With
 * neither, the first skill is open.
 */
export const SettingsSearchSchema = z.object({
  skill: z.string().optional().catch(undefined),
  new: z.literal(true).optional().catch(undefined),
  /** Connections opens this tool's dialog, as Sync activity's Reconnect asks (spec 035): `?tool=jira`. */
  tool: z.enum(['jira', 'github']).optional().catch(undefined),
});
export type SettingsSearch = z.infer<typeof SettingsSearchSchema>;
