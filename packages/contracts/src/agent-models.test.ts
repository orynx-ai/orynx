import { describe, expect, it } from 'vitest';
import { AgentModelIdSchema, AgentModelsSchema, apiRoutes, StartSessionRequestSchema } from './index.ts';

describe('AgentModelsSchema', () => {
  it('carries the models Claude Code lists, each with its effort levels', () => {
    const listed = {
      state: 'ready',
      models: [
        { value: 'opus', displayName: 'Opus', description: 'Most capable', efforts: ['low', 'high', 'max'] },
        { value: 'haiku', displayName: 'Haiku', description: 'Fastest', efforts: [] },
      ],
    };
    expect(AgentModelsSchema.parse(listed)).toEqual(listed);
    expect(AgentModelsSchema.parse({ state: 'unavailable', why: 'signed out' })).toEqual({ state: 'unavailable' });
  });

  it('takes ids as Claude Code spells them, and nothing that could read as an option or a path', () => {
    for (const id of ['opus', 'claude-sonnet-5', 'sonnet[1m]', 'us.anthropic.claude-opus-5-5:0']) {
      expect(AgentModelIdSchema.safeParse(id).success).toBe(true);
    }
    for (const id of ['', '--model', '../opus', 'opus sonnet', 'a'.repeat(201)]) {
      expect(AgentModelIdSchema.safeParse(id).success).toBe(false);
    }
  });

  it('is served at /api/agent/models', () => {
    expect(apiRoutes.agentModels).toBe('/api/agent/models');
  });
});

describe('StartSessionRequestSchema', () => {
  it("takes the composer's model and effort, both optional", () => {
    const start = { message: 'Fix it', context: [], model: 'opus', effort: 'high' };
    expect(StartSessionRequestSchema.parse(start)).toEqual(start);
    expect(StartSessionRequestSchema.parse({ message: 'Fix it', context: [] })).toEqual({
      message: 'Fix it',
      context: [],
    });
    expect(StartSessionRequestSchema.safeParse({ ...start, effort: 'huge' }).success).toBe(false);
  });
});
