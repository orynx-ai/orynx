import type { Permissions } from '@devhub/contracts';

export type PermissionRow = keyof Permissions;

/** One option in a row: the saved value and its word. */
export interface RowChoice {
  value: string;
  label: string;
}

const allow: RowChoice = { value: 'allow', label: 'Allow' };
const ask: RowChoice = { value: 'ask', label: 'Ask' };
const block: RowChoice = { value: 'never', label: 'Block' };

/**
 * Each kind of call Claude makes (spec 026), in the words of the user's redesign (19 Oct 2026). Only push and pull
 * request can be blocked: the agent runtime has no Never for the others.
 */
export const permissionRows: Record<
  PermissionRow,
  {
    title: string;
    help: string;
    /** How the summary names it, after "Without asking" and the rest. */
    short: string;
    choices: readonly RowChoice[];
    /** Under the row while it's set to Allow. */
    warning?: string;
  }
> = {
  edits: {
    title: 'Edit files',
    help: "In the session's own copy of the repository. Edits anywhere else are refused.",
    short: 'edit files',
    choices: [allow, ask],
  },
  commands: {
    title: 'Run commands',
    help: "In a sandbox with no network that writes only to the session's copy.",
    short: 'run commands',
    choices: [{ value: 'any', label: 'Any' }, { value: 'allowed_list', label: 'Allowed only' }, ask],
  },
  network: {
    title: 'Commands that use the network',
    help: 'Such as npm install, curl or git fetch. Allowed, they run outside the sandbox.',
    short: 'use the network',
    choices: [allow, ask],
    warning: 'Anything Claude downloads runs on your computer.',
  },
  unsandboxed: {
    title: 'Commands outside the sandbox',
    help: "When Claude asks to run one there. One Orynx can't read always asks.",
    short: 'run outside the sandbox',
    choices: [allow, ask],
    warning: 'These can change files and settings anywhere on your computer.',
  },
  deleteOutside: {
    title: "Deleting outside the session's copy",
    help: 'Such as rm ~/notes.txt. Allowed, it runs outside the sandbox.',
    short: 'delete outside its copy',
    choices: [allow, ask],
    warning: "Deleted files don't go to the Trash and can't be brought back.",
  },
  push: {
    title: 'Push the branch',
    help: "Only the session's branch to origin, never forced, with your own git login.",
    short: 'push the branch',
    choices: [allow, ask, block],
    warning: 'Code reaches GitHub with no one looking first. Text in a ticket or comment could steer it.',
  },
  pullRequest: {
    title: 'Open a pull request',
    help: "With gh pr create for the session's branch, as you on GitHub.",
    short: 'open pull requests',
    choices: [allow, ask, block],
    warning: 'Your team sees a pull request you have not reviewed.',
  },
};

/** The rows by how far a call reaches, each group with how risky it is. */
export const permissionGroups = [
  {
    id: 'copy',
    title: "Inside the session's copy",
    risk: 'Contained',
    tone: 'success',
    note: 'Sandbox · no network',
    rows: ['edits', 'commands'],
  },
  {
    id: 'computer',
    title: 'On your computer',
    risk: 'Can change your machine',
    tone: 'warning',
    note: 'Outside the sandbox',
    rows: ['network', 'unsandboxed', 'deleteOutside'],
  },
  {
    id: 'github',
    title: 'On GitHub',
    risk: 'Your team sees it',
    tone: 'danger',
    note: 'Uses your git and gh login',
    rows: ['push', 'pullRequest'],
  },
] as const;

export type Level = 'cautious' | 'balanced' | 'handsoff';

/** The levels to start from: each sets all seven rows at once. */
export const levels: readonly {
  id: Level;
  name: string;
  detail: string;
  recommended: boolean;
  permissions: Permissions;
}[] = [
  {
    id: 'cautious',
    name: 'Cautious',
    detail: 'Asks before every edit and command.',
    recommended: false,
    permissions: {
      edits: 'ask',
      commands: 'ask',
      network: 'ask',
      unsandboxed: 'ask',
      deleteOutside: 'ask',
      push: 'ask',
      pullRequest: 'ask',
    },
  },
  {
    id: 'balanced',
    name: 'Balanced',
    detail: 'Edits freely, runs your allowed commands, asks for the rest.',
    recommended: true,
    permissions: {
      edits: 'allow',
      commands: 'allowed_list',
      network: 'ask',
      unsandboxed: 'ask',
      deleteOutside: 'ask',
      push: 'ask',
      pullRequest: 'ask',
    },
  },
  {
    id: 'handsoff',
    name: 'Hands-off',
    detail: 'Runs, pushes and opens pull requests by itself.',
    recommended: false,
    permissions: {
      edits: 'allow',
      commands: 'any',
      network: 'allow',
      unsandboxed: 'allow',
      deleteOutside: 'ask',
      push: 'allow',
      pullRequest: 'allow',
    },
  },
];

export const customLevel = { name: 'Custom', detail: 'Your own mix. Changing any row picks this.' };

/** The level whose rows are exactly these, or custom when none is. */
export function levelOf(permissions: Permissions): Level | 'custom' {
  const rows = Object.keys(permissionRows) as PermissionRow[];
  const level = levels.find((one) => rows.every((row) => one.permissions[row] === permissions[row]));
  return level?.id ?? 'custom';
}

/** "Edit files, push the branch." from a list of short names; "Nothing" when it's empty. */
function sentence(names: readonly string[]): string {
  const text = names.join(', ');
  return text === '' ? 'Nothing' : `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** What Claude does without asking, what asks first and what never happens, as the summary says it. */
export function summaryOf(permissions: Permissions): { free: string; asks: string; never: string } {
  const free: string[] = [];
  const asks: string[] = [];
  const never: string[] = [];
  for (const row of Object.keys(permissionRows) as PermissionRow[]) {
    const value = permissions[row];
    if (row === 'commands') {
      if (value === 'any') free.push('run any command');
      else if (value === 'allowed_list') {
        free.push('run your allowed commands');
        asks.push('run other commands');
      } else asks.push('run commands');
      continue;
    }
    const short = permissionRows[row].short;
    if (value === 'allow') free.push(short);
    else if (value === 'ask') asks.push(short);
    else never.push(short);
  }
  return { free: sentence(free), asks: sentence(asks), never: sentence(never) };
}
