import { describe, expect, it } from 'vitest';
import { personName } from './person-name.ts';

describe('personName', () => {
  it('AC-16: shortens a full name to first name and last initial, like the design', () => {
    expect(personName('Rakesh Dhariwal')).toEqual({ short: 'Rakesh D.', initials: 'RD' });
  });

  it('AC-16: uses the first and last words of a longer name', () => {
    expect(personName('  Mary   Ann  Smith ')).toEqual({ short: 'Mary S.', initials: 'MS' });
  });

  it('AC-16: keeps a one-word name whole', () => {
    expect(personName('Ada')).toEqual({ short: 'Ada', initials: 'A' });
  });

  it('upper-cases initials and keeps letters outside ASCII whole', () => {
    expect(personName('ünal çelik')).toEqual({ short: 'ünal Ç.', initials: 'ÜÇ' });
    expect(personName('𝒜da Lovelace').initials).toBe('𝒜L');
  });
});
