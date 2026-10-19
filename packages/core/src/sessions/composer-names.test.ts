import { describe, expect, it } from 'vitest';
import { branchSlug, titleFrom } from './composer-names.ts';

describe('the title of a session with no ticket (spec 015, Q8a)', () => {
  it.each([
    ['Add a CSV export to the reports page', 'Add a CSV export to the reports page'],
    ['  Add a CSV export\nto the reports page\n', 'Add a CSV export'],
    ['\n\n  Fix the header  \n', 'Fix the header'],
    ['Tidy   the\tspacing', 'Tidy the spacing'],
    ['x'.repeat(80), 'x'.repeat(80)],
    [
      'Make the reports page export every column as CSV, including the hidden ones and the totals row',
      'Make the reports page export every column as CSV, including the hidden ones…',
    ],
    ['y'.repeat(120), `${'y'.repeat(79)}…`],
  ])('AC-4: %j reads as %j', (message, title) => {
    expect(titleFrom(message)).toBe(title);
    expect(titleFrom(message).length).toBeLessThanOrEqual(80);
  });
});

describe('the branch of a session with no ticket (spec 015, Q8b)', () => {
  it.each([
    ['Add a CSV export to the reports page', 'add-a-csv-export-to'],
    ['Fix the header', 'fix-the-header'],
    ['Résumé café: naïve façade', 'resume-cafe-naive-facade'],
    ['Use `useSelection` in ContentList.tsx!', 'use-useselection-in-contentlist-tsx'],
    ['Supercalifragilisticexpialidocious antidisestablishmentarianism words', 'supercalifragilisticexpialidocious'],
    ['a'.repeat(50), 'a'.repeat(40)],
    ['日本語のタスク', 'task'],
    ['  ---  ', 'task'],
  ])('AC-4: %j becomes feat/%s', (title, slug) => {
    expect(branchSlug(title)).toBe(slug);
    expect(branchSlug(title)).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(branchSlug(title).length).toBeLessThanOrEqual(40);
  });
});
