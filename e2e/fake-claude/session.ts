// Stands in for a Claude Code session in the e2e run (spec 011): `claude` hands it every run the Agent SDK
// starts with `--input-format stream-json`. It speaks the SDK's protocol as the pinned version (0.3.302)
// does, as far as a session needs: it answers `initialize` and `interrupt`, asks `can_use_tool` before an
// edit, and plays one scripted run. It never reaches Claude, and it edits only its working folder, which
// is the session's worktree. Run by Node directly, which strips the types.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';

type Message = Record<string, unknown>;

const sessionId = 'e2e00000-0000-4000-8000-000000000011';
const stepMs = 400;
const tools = (process.argv.find((arg) => arg.startsWith('--tools=')) ?? '--tools=').slice('--tools='.length);

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

/** Claude calls a tool: the call, then its result. `edit` asks first and writes the file when allowed. */
async function call(tool: string, input: Message, edit?: { path: string; content: string }): Promise<void> {
  const id = nextId('toolu');
  let allowed = true;
  let said = 'ok';
  if (edit !== undefined) {
    const answer = await ask(tool, input, id);
    allowed = answer['behavior'] === 'allow';
    if (allowed) {
      const file = join(process.cwd(), edit.path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, edit.content);
    } else {
      said = typeof answer['message'] === 'string' ? answer['message'] : 'Refused.';
    }
  }
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

/** One run: read, plan, edit, then finish, or wait for Stop when the brief says "(waits)". */
async function play(brief: string): Promise<void> {
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
  ];
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
  send({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'Added row selection and an Archive selected button.',
    duration_ms: stepMs * 5,
    duration_api_ms: 0,
    num_turns: steps.length,
    total_cost_usd: 0,
    usage: { input_tokens: 0, output_tokens: 0 },
    permission_denials: [],
    session_id: sessionId,
    uuid: nextId('uuid'),
  });
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
    void play(typeof content === 'string' ? content : JSON.stringify(content));
  }
});
input.on('close', () => {
  inputEnded();
});

// Claude Code exits once the SDK closes its input.
await inputEnd;
process.exit(0);
