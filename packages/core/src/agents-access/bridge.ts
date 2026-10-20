import { createHash } from 'node:crypto';
import { chmod, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The bridge between an agent outside Orynx and Orynx's MCP server (spec 037, AC-43). An MCP client starts it as a
 * command and talks to it over stdio; it passes each message to `/api/mcp` with the agents' token, finding Orynx's
 * port in `runtime.json` for every message, so a restart, or the desktop app's new port at each launch, changes
 * nothing in the config you copied. The token lives in the bridge, mode 0600 under DEVHUB_HOME, never in that config
 * or the page. One bridge per token: turning the door off deletes them all, so an old config stops working (AC-42).
 */

/** Where the bridges live. */
export function bridgeFolder(devhubHome: string): string {
  return join(devhubHome, 'mcp');
}

/** The program the bridge runs on: the one running Orynx now, as Node even inside the desktop app. */
export interface BridgeProgram {
  path: string;
  /** The desktop app's own program, which runs a script as Node only when told to. */
  electron: boolean;
}

export function currentProgram(): BridgeProgram {
  return { path: process.execPath, electron: process.versions['electron'] !== undefined };
}

/**
 * The bridge itself: plain Node with nothing to install, run by the agent's MCP client. `home` and `token` are
 * written in as JSON strings. It names its client to Orynx (`x-orynx-agent`) by the name the client gave in
 * `initialize`, when that's plain text.
 */
export function bridgeSource(home: string, token: string): string {
  return `// Orynx's MCP bridge (spec 037), written by Orynx for one agents' token. Don't share it: it opens your tickets.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const home = ${JSON.stringify(home)};
const token = ${JSON.stringify(token)};
let agent = null;

function say(message) {
  process.stdout.write(JSON.stringify(message) + '\\n');
}

function fail(id, text) {
  if (id !== null && id !== undefined) say({ jsonrpc: '2.0', id, error: { code: -32000, message: text } });
}

async function forward(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  const id = Array.isArray(message) ? null : message?.id;
  const name = message?.method === 'initialize' ? message.params?.clientInfo?.name : undefined;
  if (typeof name === 'string' && /^[\\x20-\\x7e]{1,100}$/.test(name)) agent = name;
  let port;
  try {
    port = JSON.parse(await readFile(join(home, 'runtime.json'), 'utf8')).port;
  } catch {
    return fail(id, "Orynx isn't running. Open it, then try again.");
  }
  let response;
  try {
    response = await fetch('http://127.0.0.1:' + port + '/api/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: 'Bearer ' + token,
        ...(agent === null ? {} : { 'x-orynx-agent': agent }),
      },
      body: line,
    });
  } catch {
    return fail(id, "Orynx isn't running. Open it, then try again.");
  }
  const text = await response.text();
  if (response.status === 401) {
    return fail(id, 'Orynx no longer lets this agent in. Copy the MCP config from Settings › Coding agent again.');
  }
  if (!response.ok) return fail(id, 'Orynx answered ' + response.status + '.');
  if (text.trim() !== '') say(JSON.parse(text));
}

let queue = Promise.resolve();
createInterface({ input: process.stdin }).on('line', (line) => {
  queue = queue.then(() => forward(line)).catch(() => undefined);
});
`;
}

/** The bridge's name for a token, so each Copy for one token writes one file. */
function bridgeName(token: string): string {
  return `orynx-mcp-${createHash('sha256').update(token).digest('hex').slice(0, 16)}.mjs`;
}

/** Writes the bridge for `token` (0600, in a 0700 folder) and answers its path. */
export async function writeBridge(devhubHome: string, token: string): Promise<string> {
  const folder = bridgeFolder(devhubHome);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await chmod(folder, 0o700);
  const path = join(folder, bridgeName(token));
  await writeFile(path, bridgeSource(devhubHome, token), { mode: 0o600 });
  await chmod(path, 0o600);
  return path;
}

/** Deletes every bridge, for when the door shuts. */
export async function removeBridges(devhubHome: string): Promise<void> {
  const folder = bridgeFolder(devhubHome);
  const names = await readdir(folder).catch(() => [] as string[]);
  await Promise.all(
    names
      .filter((name) => /^orynx-mcp-[0-9a-f]{16}\.mjs$/.test(name))
      .map((name) => rm(join(folder, name), { force: true })),
  );
}

/** The MCP config to paste into another tool: the usual `mcpServers` shape, which Claude Code, Cursor and VS Code read. */
export function mcpConfig(bridge: string, program: BridgeProgram): string {
  const server = {
    command: program.path,
    args: [bridge],
    ...(program.electron ? { env: { ELECTRON_RUN_AS_NODE: '1' } } : {}),
  };
  return JSON.stringify({ mcpServers: { orynx: server } }, null, 2);
}
