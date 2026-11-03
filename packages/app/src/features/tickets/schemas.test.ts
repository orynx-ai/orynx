import { describe, expect, it } from 'vitest';
import { makeJiraTicketTypes } from '@devhub/contracts/testing';
import { typeIn } from './schemas.ts';

describe('typeIn', () => {
  const { types } = makeJiraTicketTypes();
  const named = (name: string) => types.find((type) => type.name === name);

  it('spec 019 Q2: the picked type, else Task', () => {
    expect(typeIn(types, '')).toBe(named('Task'));
    const [first] = types;
    if (first !== undefined) expect(typeIn(types, first.id)).toBe(first);
  });

  it('016 AC-34: Fix this starts on Bug when the project has one, else Task', () => {
    expect(typeIn(types, '', 'Bug')).toBe(named('Bug'));
    expect(typeIn(types, '', 'Incident')).toBe(named('Task'));
  });
});
