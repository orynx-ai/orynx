// Stands in for a Claude Code session in the e2e run (specs 011 to 013): `claude` hands it every run the
// Agent SDK starts with `--input-format stream-json`. It speaks the SDK's protocol as the pinned version
// (0.3.302) does, as far as a session needs: it answers `initialize` and `interrupt`, asks `can_use_tool`
// before an edit or a command, and plays one scripted run, picked by words in the ticket's title. It never
// reaches Claude and never runs a command: an allowed command is only written down, in `ran.txt` in its
// working folder, which is the session's worktree. Run by Node directly, which strips the types.
//
// Spec 014: a run with no tools that isn't saved (`--tools=` and `--no-session-persistence`) is Orynx asking for
// text: a pull request's title and description, or with "Changed files since the last push" in it, a commit
// message. "(no draft)" in the ticket's title makes it fail as a signed-out Claude Code would.
//
// Spec 013: a message that comes while it works waits, and is taken into the turn after its next tool call;
// each result says which messages its turn took and how many still wait. `--resume` with its own session id
// plays a follow-up (it writes the message it got into `src/follow-up.ts` and finishes); any other id exits
// before it starts, as Claude Code does when it can't find the conversation. "(slow)" in the title makes it
// wait for a message after its first read, and "(hold)" in a follow-up after its edit, so a test can send one
// while it works.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';

type Message = Record<string, unknown>;

const sessionId = 'e2e00000-0000-4000-8000-000000000011';
/** An option's value: the SDK passes each as one argument, `--resume=<id>`. */
function option(name: string): string | null {
  const arg = process.argv.find((one) => one.startsWith(`${name}=`));
  return arg === undefined ? null : arg.slice(name.length + 1);
}

const resumed = option('--resume');
const stepMs = 400;
const tools = option('--tools') ?? '';
/** Orynx asking for text alone (spec 014): no tools, and nothing saved. */
const writing = tools === '' && process.argv.includes('--no-session-persistence');

let count = 0;
const nextId = (prefix: string) => {
  count += 1;
  return `${prefix}_${String(count)}`;
};

function send(message: Message): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const answers = new Map<string, (response: Message) => void>();
let interrupted: () => void = () => undefined;
const interruption = new Promise<void>((resolve) => {
  interrupted = resolve;
});
let inputEnded: () => void = () => undefined;
const inputEnd = new Promise<void>((resolve) => {
  inputEnded = resolve;
});

const pause = (ms: number) => Promise.race([new Promise((resolve) => setTimeout(resolve, ms)), interruption]);

/** Messages that came after the first and no turn has taken yet, and the ids the current turn took. */
const queued: string[] = [];
let taken: string[] = [];
/** How many messages came after the first, taken or not. */
let later = 0;
let heard: () => void = () => undefined;
/** Claude Code takes the queued messages into the turn between tool calls. */
function fold(): void {
  taken.push(...queued.splice(0));
}
/** Waits until a message comes, or Stop. */
function aMessage(): Promise<unknown> {
  if (queued.length > 0) return Promise.resolve();
  return Promise.race([
    new Promise<void>((resolve) => {
      heard = resolve;
    }),
    interruption,
  ]);
}

/** Asks the SDK whether a tool may run, as Claude Code does in the default permission mode. */
function ask(tool: string, input: Message, toolUseId: string): Promise<Message> {
  const requestId = nextId('fake-permission');
  const answer = new Promise<Message>((resolve) => answers.set(requestId, resolve));
  send({
    type: 'control_request',
    request_id: requestId,
    request: { subtype: 'can_use_tool', tool_name: tool, input, tool_use_id: toolUseId },
  });
  return answer;
}

/** What a call does once allowed: nothing, write a file (an edit), or note a command in ran.txt. */
type Effect = { path: string; content: string } | { command: string } | undefined;

function apply(effect: Effect): void {
  if (effect === undefined) return;
  if ('command' in effect) {
    appendFileSync(join(process.cwd(), 'ran.txt'), `${effect.command}\n`);
    return;
  }
  const file = join(process.cwd(), effect.path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, effect.content);
}

/** Asks about a call that has an effect, as Claude Code does in the default permission mode. */
async function decide(tool: string, input: Message, id: string, effect: Effect) {
  if (effect === undefined) return { allowed: true, said: 'ok' };
  const answer = await ask(tool, input, id);
  if (answer['behavior'] === 'allow') {
    apply(effect);
    return { allowed: true, said: 'ok' };
  }
  return { allowed: false, said: typeof answer['message'] === 'string' ? answer['message'] : 'Refused.' };
}

/** Claude calls a tool: the call, then its result. A call with an effect asks first, and has it only when allowed. */
async function call(tool: string, input: Message, effect?: Effect): Promise<void> {
  const id = nextId('toolu');
  const { allowed, said } = await decide(tool, input, id, effect);
  sendCall(tool, input, id, allowed, said);
  fold();
}

/** A turn ends well: its summary, the messages it took, and how many still wait. */
function sendResult(summary: string): void {
  send({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: summary,
    duration_ms: stepMs * 5,
    duration_api_ms: 0,
    num_turns: 1,
    total_cost_usd: 0,
    usage: { input_tokens: 0, output_tokens: 0 },
    permission_denials: [],
    user_message_uuids: taken,
    queued_turn_count: queued.length,
    session_id: sessionId,
    uuid: nextId('uuid'),
  });
  taken = [];
}

/** Claude calls several tools in one message: it asks about all of them at once (spec 012, AC-10). */
async function together(calls: { tool: string; input: Message; effect: Effect }[]): Promise<void> {
  const ids = calls.map(() => nextId('toolu'));
  const answers = await Promise.all(calls.map((one, i) => decide(one.tool, one.input, ids[i] ?? '', one.effect)));
  calls.forEach((one, i) => {
    const answer = answers[i];
    if (answer !== undefined) sendCall(one.tool, one.input, ids[i] ?? '', answer.allowed, answer.said);
  });
}

/** A command Claude wants to run, with its own line about it. */
function bash(command: string, description: string) {
  return { tool: 'Bash', input: { command, description }, effect: { command } };
}

function sendCall(tool: string, input: Message, id: string, allowed: boolean, said: string): void {
  send({
    type: 'assistant',
    parent_tool_use_id: null,
    session_id: sessionId,
    uuid: nextId('uuid'),
    message: {
      id: nextId('msg'),
      type: 'message',
      role: 'assistant',
      content: [{ type: 'tool_use', id, name: tool, input }],
    },
  });
  send({
    type: 'user',
    parent_tool_use_id: null,
    session_id: sessionId,
    uuid: nextId('uuid'),
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: said, is_error: !allowed }] },
  });
}

let stopped = false;
let playing = false;
/** Read through a call: Stop can come while a turn waits, which TypeScript can't see. */
const isStopped = () => stopped;

/** The commands a ticket's title asks the fake to run after its edit (spec 012). */
function commandsFor(brief: string): (() => Promise<void>)[] {
  const steps: (() => Promise<void>)[] = [];
  if (brief.includes('(runs tests)')) {
    const test = bash('npm test -- content-list', 'Run the content list tests');
    steps.push(() => call(test.tool, test.input, test.effect));
  }
  if (brief.includes('(fetches)')) {
    const fetch = bash('curl -fsS https://registry.npmjs.org/react', 'Look up the react package');
    steps.push(() => call(fetch.tool, fetch.input, fetch.effect));
  }
  if (brief.includes('(pushes)')) {
    const push = bash('git push origin HEAD', 'Push the branch');
    steps.push(() => call(push.tool, push.input, push.effect));
  }
  if (brief.includes('(runs two)')) {
    steps.push(() => together([bash('npm test', 'Run the tests'), bash('npm run lint', 'Check the code style')]));
  }
  return steps;
}

/**
 * One run: read, plan, edit, then any commands the ticket's title asks for, then finish; or wait for Stop
 * when it says "(waits)".
 */
async function play(brief: string): Promise<void> {
  // What Claude got, so a spec can read it back (spec 015, AC-20).
  const configDir = process.env['CLAUDE_CONFIG_DIR'];
  if (configDir !== undefined) {
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'last-brief.txt'), brief);
  }
  send({
    type: 'system',
    subtype: 'init',
    session_id: sessionId,
    uuid: nextId('uuid'),
    cwd: process.cwd(),
    tools: tools === '' ? [] : tools.split(','),
    mcp_servers: [],
    plugins: [],
    model: 'fake',
    permissionMode: 'default',
    apiKeySource: 'none',
  });
  const steps: (() => Promise<void>)[] = [
    () => call('Read', { file_path: join(process.cwd(), 'README.md') }),
    () => call('Glob', { pattern: '**/*.md' }),
    () =>
      call('TodoWrite', {
        todos: [
          { content: 'Row selection', status: 'in_progress', activeForm: 'Adding row selection' },
          { content: 'A bulkArchive API call', status: 'pending', activeForm: 'Adding the API call' },
        ],
      }),
    () =>
      call(
        'Write',
        { file_path: join(process.cwd(), 'src', 'archive.ts'), content: 'export const archive = true;\n' },
        { path: join('src', 'archive.ts'), content: 'export const archive = true;\n' },
      ),
    ...commandsFor(brief),
  ];
  if (brief.includes('(slow)')) steps.splice(1, 0, () => aMessage().then(() => undefined));
  for (const step of steps) {
    await pause(stepMs);
    if (stopped) return;
    await step();
  }
  if (brief.includes('(waits)')) {
    await interruption;
    return;
  }
  await pause(stepMs);
  if (stopped) return;
  sendResult('Added row selection and an Archive selected button.');
  await answerTheRest();
}

/** A message still waiting when a turn ends gets a turn of its own, as Claude Code gives it. */
async function answerTheRest(): Promise<void> {
  while (queued.length > 0 && !isStopped()) {
    fold();
    await pause(stepMs);
    if (isStopped()) return;
    sendResult('Did what you asked.');
  }
}

/**
 * A follow-up, resuming this session (spec 013): one more edit, which writes down the message exactly as it
 * came, then the finish; with "(hold)", only once another message has come.
 */
async function followUp(asked: string): Promise<void> {
  send({
    type: 'system',
    subtype: 'init',
    session_id: sessionId,
    uuid: nextId('uuid'),
    cwd: process.cwd(),
    tools: tools === '' ? [] : tools.split(','),
    mcp_servers: [],
    plugins: [],
    model: 'fake',
    permissionMode: 'default',
    apiKeySource: 'none',
  });
  await pause(stepMs);
  if (stopped) return;
  const content = `export const asked = ${JSON.stringify(asked)};\n`;
  await call(
    'Write',
    { file_path: join(process.cwd(), 'src', 'follow-up.ts'), content },
    { path: join('src', 'follow-up.ts'), content },
  );
  // A message may have come, and been taken, before the edit: then there's nothing to wait for.
  if (asked.includes('(hold)') && later === 0) await aMessage();
  fold();
  await pause(stepMs);
  if (isStopped()) return;
  sendResult('Did what you asked.');
  await answerTheRest();
}

/** Orynx asks for text alone (spec 014): a pull request's draft, or a commit message for Push changes. */
async function write(asked: string): Promise<void> {
  send({
    type: 'system',
    subtype: 'init',
    session_id: sessionId,
    uuid: nextId('uuid'),
    cwd: process.cwd(),
    tools: [],
    mcp_servers: [],
    plugins: [],
    model: 'fake',
    permissionMode: 'default',
    apiKeySource: 'none',
  });
  await pause(stepMs);
  if (asked.includes('(no draft)')) {
    send({ type: 'assistant', parent_tool_use_id: null, error: 'authentication_failed', message: { content: [] } });
    return;
  }
  sendResult(
    asked.includes('Changed files since the last push')
      ? 'Use the existing useSelection hook'
      : 'Add bulk archive to the content list\n\n## What changed\n\n- Row selection and Archive selected.\n\n' +
          '## How it was checked\n\n`npm test -- content-list` passes.',
  );
}

// Claude Code can't resume a conversation it doesn't have: it says so and exits before it starts.
if (resumed !== null && resumed !== sessionId) {
  process.stderr.write(`No conversation found with session ID: ${resumed}\n`);
  process.exit(1);
}

const input = createInterface({ input: process.stdin });
input.on('line', (line) => {
  let message: Message;
  try {
    message = JSON.parse(line) as Message;
  } catch {
    return;
  }
  const request = message['request'] as Message | undefined;
  if (message['type'] === 'control_request' && request !== undefined) {
    send({
      type: 'control_response',
      response: { subtype: 'success', request_id: message['request_id'], response: {} },
    });
    if (request['subtype'] === 'interrupt') {
      stopped = true;
      interrupted();
      // An interrupted turn still ends with a result; the SDK closes the input only after one.
      send({
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        errors: [],
        duration_ms: 0,
        duration_api_ms: 0,
        num_turns: 0,
        total_cost_usd: 0,
        usage: { input_tokens: 0, output_tokens: 0 },
        permission_denials: [],
        session_id: sessionId,
        uuid: nextId('uuid'),
      });
    }
    return;
  }
  if (message['type'] === 'control_response') {
    const response = message['response'] as Message | undefined;
    const answer = answers.get(String(response?.['request_id']));
    answer?.((response?.['response'] as Message | undefined) ?? {});
    return;
  }
  if (message['type'] === 'user') {
    const content = (message['message'] as Message | undefined)?.['content'];
    const uuid = message['uuid'];
    if (playing) {
      // Claude is working: the message waits for its next tool call.
      if (typeof uuid === 'string') queued.push(uuid);
      later += 1;
      heard();
      return;
    }
    playing = true;
    if (typeof uuid === 'string') taken.push(uuid);
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    void (writing ? write(text) : resumed === null ? play(text) : followUp(text));
  }
});
input.on('close', () => {
  inputEnded();
});

// Claude Code exits once the SDK closes its input.
await inputEnd;
process.exit(0);
