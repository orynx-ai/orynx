import { z } from 'zod';

/** Settings tabs built so far. The spec's other three (Coding agent, Repositories, Inbox rules) come with roadmap 005. */
export const SettingsTabSchema = z.enum(['connections', 'appearance']);
export type SettingsTab = z.infer<typeof SettingsTabSchema>;

export const settingsTabLabels: Record<SettingsTab, string> = {
  connections: 'Connections',
  appearance: 'Appearance',
};
