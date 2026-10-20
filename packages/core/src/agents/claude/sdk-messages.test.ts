import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it } from 'vitest';
import { createMessageReader } from './sdk-messages.ts';

const worktree = '/Users/you/.devhub/worktrees/0123456789abcdef';
const session = { session_id: 'b2c7e0f4-0000-4000-8000-000000000001', uuid: 'b2c7e0f4-0000-4000-8000-0000000000aa' };

// The SDK's messages carry far more than the reader looks at; these hold the fields Claude Code sends
// that the reader needs, in the SDK's own shapes, and are cast once here.
const as = (message: object) => message as SDKMessage;

function toolUse(id: string, name: string, input: object) {
  return as({
    type: 'assistant',
    parent_tool_use_id: null,
    ...session,
    message: { id: `msg_${id}`, role: 'assistant', type: 'message', content: [{ type: 'tool_use', id, name, input }] },
  });
}

function toolResult(id: string, isError = false, content: unknown = 'ok') {
  return as({
    type: 'user',
    parent_tool_use_id: null,
    ...session,
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content, is_error: isError }] },
  });
}

const init = as({
  type: 'system',
  subtype: 'init',
  ...session,
  cwd: worktree,
  tools: ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'NotebookEdit', 'TodoWrite'],
  mcp_servers: [],
  plugins: [],
  model: 'claude-opus-5-5',
  permissionMode: 'default',
  apiKeySource: 'none',
});

const success = (result: string, extra: object = {}) =>
  as({ type: 'result', subtype: 'success', is_error: false, result, num_turns: 4, ...session, ...extra });

describe('createMessageReader', () => {
  it('AC-3: says Claude Code started, with its session id and how much it loaded, by count only', () => {
    const read = createMessageReader(worktree);
    expect(read(init)).toEqual([
      { type: 'started', claudeSessionId: session.session_id, loaded: { tools: 7, mcpServers: 0, plugins: 0 } },
    ]);
  });

  it('AC-4: turns a read that worked into explore, with its path inside the worktree', () => {
    const read = createMessageReader(worktree);
    expect(read(toolUse('t1', 'Read', { file_path: `${worktree}/src/ContentList.tsx` }))).toEqual([]);
    expect(read(toolResult('t1'))).toEqual([{ type: 'work', work: { kind: 'explore', file: 'src/ContentList.tsx' } }]);
  });

  it('AC-4: turns searches into explore with no single file', () => {
    const read = createMessageReader(worktree);
    read(toolUse('t1', 'Grep', { pattern: 'archive' }));
    read(toolUse('t2', 'Glob', { pattern: '**/*.tsx' }));
    expect([...read(toolResult('t1')), ...read(toolResult('t2'))]).toEqual([
      { type: 'work', work: { kind: 'explore', file: null } },
      { type: 'work', work: { kind: 'explore', file: null } },
    ]);
  });

  it('AC-4: turns an edit, a new file and a notebook change into edit', () => {
    const read = createMessageReader(worktree);
    read(toolUse('t1', 'Edit', { file_path: `${worktree}/src/a.ts`, old_string: '1', new_string: '2' }));
    read(toolUse('t2', 'Write', { file_path: 'src/b.ts', content: 'x' }));
    read(toolUse('t3', 'NotebookEdit', { notebook_path: `${worktree}/n.ipynb`, new_source: 'x' }));
    expect([...read(toolResult('t1')), ...read(toolResult('t2')), ...read(toolResult('t3'))]).toEqual([
      { type: 'work', work: { kind: 'edit', file: 'src/a.ts' } },
      { type: 'files_changed' },
      { type: 'work', work: { kind: 'edit', file: 'src/b.ts' } },
      { type: 'files_changed' },
      { type: 'work', work: { kind: 'edit', file: 'n.ipynb' } },
      { type: 'files_changed' },
    ]);
  });

  it('AC-4: turns Claude’s to-do list into the plan’s items', () => {
    const read = createMessageReader(worktree);
    read(
      toolUse('t1', 'TodoWrite', {
        todos: [
          { content: 'Row selection', status: 'in_progress', activeForm: 'Adding row selection' },
          { content: 'A bulkArchive API call', status: 'pending', activeForm: 'Adding the call' },
        ],
      }),
    );
    expect(read(toolResult('t1'))).toEqual([
      { type: 'work', work: { kind: 'plan', items: ['Row selection', 'A bulkArchive API call'] } },
    ]);
  });

  it('AC-5: leaves out a call that failed or was refused: the refusal is its own step from the tool decision', () => {
    const read = createMessageReader(worktree);
    read(toolUse('t1', 'Write', { file_path: '/etc/hosts', content: 'x' }));
    expect(read(toolResult('t1', true))).toEqual([]);
  });

  it('012 AC-2: shows a command Claude Code ran without asking Orynx, even one that failed', () => {
    const read = createMessageReader(
      worktree,
      () => false,
      () => 0,
    );
    read(toolUse('t1', 'Bash', { command: 'npm test' }));
    expect(read(toolResult('t1', true))).toEqual([
      { type: 'work', work: { kind: 'command', id: 't1', command: 'npm test' } },
      { type: 'command_ended', id: 't1', output: 'ok', failed: true, ms: 0 },
      { type: 'files_changed' },
    ]);
  });

  it('012 AC-2: leaves out a command Orynx already showed when it decided about it', () => {
    const read = createMessageReader(
      worktree,
      (id) => id === 't1',
      () => 0,
    );
    read(toolUse('t1', 'Bash', { command: 'npm test' }));
    expect(read(toolResult('t1'))).toEqual([
      { type: 'command_ended', id: 't1', output: 'ok', failed: false, ms: 0 },
      { type: 'files_changed' },
    ]);
  });

  it('AC-19 (036): says when each command ended, with Claude Code’s output, whether it failed, and how long it ran', () => {
    let at = 1_000;
    const read = createMessageReader(
      worktree,
      () => true,
      () => at,
    );
    read(toolUse('t1', 'Bash', { command: 'npm test' }));
    read(toolUse('t2', 'Bash', { command: 'npm run lint' }));
    at = 4_100;
    expect(read(toolResult('t1', true, ' FAIL  src/a.test.ts\nTests: 1 failed'))).toContainEqual({
      type: 'command_ended',
      id: 't1',
      output: ' FAIL  src/a.test.ts\nTests: 1 failed',
      failed: true,
      ms: 3_100,
    });
    // Claude Code can give a result as text blocks; anything that isn't text is left out.
    const blocks = [{ type: 'text', text: '0 problems' }, { type: 'image' }, { type: 'text', text: 'Done' }];
    expect(read(toolResult('t2', false, blocks))).toContainEqual({
      type: 'command_ended',
      id: 't2',
      output: '0 problems\nDone',
      failed: false,
      ms: 3_100,
    });
  });

  it('AC-19 (036): gives no output for a result it can’t read, and says nothing of a call that isn’t a command', () => {
    const read = createMessageReader(
      worktree,
      () => true,
      () => 0,
    );
    read(toolUse('t1', 'Bash', { command: 'ls' }));
    read(toolUse('t2', 'Read', { file_path: 'src/a.ts' }));
    expect(read(toolResult('t1', false, { odd: true }))).toContainEqual(
      expect.objectContaining({ type: 'command_ended', output: '' }) as unknown,
    );
    expect(read(toolResult('t2')).some((said) => said.type === 'command_ended')).toBe(false);
  });

  it('013 AC-2: says files may have changed once a command ends, run or refused, since it can write anything', () => {
    const read = createMessageReader(worktree, () => true);
    read(toolUse('t1', 'Bash', { command: 'npx prettier --write .' }));
    read(toolUse('t2', 'Bash', { command: 'git push' }));
    const said = [...read(toolResult('t1')), ...read(toolResult('t2', true))];
    expect(said.filter((one) => one.type === 'files_changed')).toHaveLength(2);
  });

  it('013 AC-2: says nothing changed for a read, a search, the plan, or an edit that failed', () => {
    const read = createMessageReader(worktree);
    read(toolUse('t1', 'Read', { file_path: 'src/a.ts' }));
    read(toolUse('t2', 'Grep', { pattern: 'x' }));
    read(toolUse('t3', 'TodoWrite', { todos: [{ content: 'x', status: 'pending', activeForm: 'x' }] }));
    read(toolUse('t4', 'Edit', { file_path: 'src/a.ts', old_string: '1', new_string: '2' }));
    const said = [
      ...read(toolResult('t1')),
      ...read(toolResult('t2')),
      ...read(toolResult('t3')),
      ...read(toolResult('t4', true)),
    ];
    expect(said.filter((one) => one.type === 'files_changed')).toEqual([]);
  });

  it('ignores a result for a call it never saw, and Claude’s text', () => {
    const read = createMessageReader(worktree);
    expect(read(toolResult('unknown'))).toEqual([]);
    const text = as({
      type: 'assistant',
      parent_tool_use_id: null,
      ...session,
      message: { content: [{ type: 'text', text: 'I will look at the list first.' }] },
    });
    expect(read(text)).toEqual([]);
  });

  it('AC-8: says a turn ended, with Claude’s summary', () => {
    const read = createMessageReader(worktree);
    expect(read(success('Added row selection and a toolbar button.'))).toEqual([
      { type: 'turn_ended', summary: 'Added row selection and a toolbar button.', queued: 0, took: null },
    ]);
  });

  it('013 AC-12: says which of your messages the turn took and how many still wait, so the adapter knows if Claude is done', () => {
    const read = createMessageReader(worktree);
    const took = ['5f0c1d2e-0000-4000-8000-000000000001'];
    expect(read(success('First part.', { user_message_uuids: took, queued_turn_count: 1 }))).toEqual([
      { type: 'turn_ended', summary: 'First part.', queued: 1, took },
    ]);
  });

  it.each([
    ['authentication_failed', 'login'],
    ['oauth_org_not_allowed', 'login'],
    ['account_on_hold', 'login'],
    ['verification_required', 'login'],
    ['cloud_credential_error', 'login'],
    ['rate_limit', 'limit'],
    ['billing_error', 'limit'],
    ['overloaded', 'limit'],
    ['server_error', 'other'],
    ['unknown', 'other'],
  ] as const)('AC-13: sorts an assistant error %s into %s', (error, kind) => {
    const read = createMessageReader(worktree);
    const failed = as({ type: 'assistant', parent_tool_use_id: null, ...session, error, message: { content: [] } });
    expect(read(failed)).toEqual([{ type: 'problem', kind, code: error }]);
  });

  it.each([
    [
      { subtype: 'error_during_execution', startup_failure_reason: 'gateway_signin_required' },
      'login',
      'gateway_signin_required',
    ],
    [{ subtype: 'error_during_execution', startup_failure_reason: 'org_verify_failed' }, 'login', 'org_verify_failed'],
    [{ subtype: 'error_during_execution', startup_failure_reason: 'cwd_unavailable' }, 'other', 'cwd_unavailable'],
    [{ subtype: 'error_during_execution' }, 'other', 'error_during_execution'],
    [{ subtype: 'error_max_turns' }, 'other', 'error_max_turns'],
  ] as const)('AC-13: sorts a failed result %j into %s', (fields, kind, code) => {
    const read = createMessageReader(worktree);
    const failed = as({
      type: 'result',
      is_error: true,
      errors: ['Something broke at /Users/you'],
      ...session,
      ...fields,
    });
    expect(read(failed)).toEqual([{ type: 'problem', kind, code }]);
  });

  it.each([
    [401, 'login'],
    [403, 'login'],
    [429, 'limit'],
    [529, 'limit'],
    [500, 'other'],
  ] as const)('AC-13: sorts a turn that ended on API status %i into %s', (status, kind) => {
    const read = createMessageReader(worktree);
    expect(read(success('API Error: …', { is_error: true, api_error_status: status }))).toEqual([
      { type: 'problem', kind, code: `api_${String(status)}` },
    ]);
  });

  it('AC-13: says only the first problem, and no Finished after it', () => {
    const read = createMessageReader(worktree);
    const failed = as({
      type: 'assistant',
      parent_tool_use_id: null,
      ...session,
      error: 'rate_limit',
      message: { content: [] },
    });
    expect(read(failed)).toHaveLength(1);
    expect(
      read(as({ type: 'result', subtype: 'error_during_execution', is_error: true, errors: [], ...session })),
    ).toEqual([]);
    expect(read(success('late'))).toEqual([]);
  });

  it('AC-21: never puts Claude’s error text in what it says', () => {
    const read = createMessageReader(worktree);
    const said = read(
      as({
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        errors: ['token sk-ant-secret leaked'],
        ...session,
      }),
    );
    expect(JSON.stringify(said)).not.toContain('sk-ant-secret');
  });

  it('ignores the messages it has no use for', () => {
    const read = createMessageReader(worktree);
    for (const message of [
      as({ type: 'system', subtype: 'status', status: 'requesting', ...session }),
      as({ type: 'system', subtype: 'api_retry', attempt: 1, ...session }),
      as({ type: 'stream_event', event: {}, ...session }),
      as({ type: 'rate_limit_event', ...session }),
    ]) {
      expect(read(message)).toEqual([]);
    }
  });
});
