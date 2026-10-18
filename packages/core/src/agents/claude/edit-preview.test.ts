import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { previewEdit, previewLineLimit, previewReadLimit } from './edit-preview.ts';

let root: string;
const source = "import { x } from './x';\n\nexport function a() {\n  return 1;\n}\n";
const sixtyLines = Array.from({ length: 60 }, (_, i) => `line ${String(i + 1)}`).join('\n');

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'devhub-edit-preview-'));
  await writeFile(join(root, 'a.ts'), source);
  await writeFile(join(root, 'big.txt'), 'x'.repeat(previewReadLimit + 1));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const file = (name: string) => join(root, name);

describe('previewEdit (Q9)', () => {
  it('AC-8: an Edit shows the lines it replaces and the lines it puts there, numbered from where the old text sits', async () => {
    const input = { file_path: file('a.ts'), old_string: 'return 1;', new_string: 'return 2;' };
    expect(await previewEdit('Edit', input, file('a.ts'))).toEqual({
      creates: false,
      lines: [
        { kind: 'removed', number: 4, text: '  return 1;' },
        { kind: 'added', number: 4, text: '  return 2;' },
      ],
      moreLines: 0,
    });
  });

  it('AC-8: an Edit across lines shows whole lines, the new ones numbered on from the first', async () => {
    const input = {
      file_path: file('a.ts'),
      old_string: 'function a() {\n  return 1;\n}',
      new_string: 'function a() {\n  const one = 1;\n  return one;\n}',
    };
    expect(await previewEdit('Edit', input, file('a.ts'))).toEqual({
      creates: false,
      lines: [
        { kind: 'removed', number: 3, text: 'export function a() {' },
        { kind: 'removed', number: 4, text: '  return 1;' },
        { kind: 'removed', number: 5, text: '}' },
        { kind: 'added', number: 3, text: 'export function a() {' },
        { kind: 'added', number: 4, text: '  const one = 1;' },
        { kind: 'added', number: 5, text: '  return one;' },
        { kind: 'added', number: 6, text: '}' },
      ],
      moreLines: 0,
    });
  });

  it('AC-8: an Edit whose old text is not in the file is shown from the call alone, numbered from 1', async () => {
    const input = { file_path: file('a.ts'), old_string: 'nothing\nhere', new_string: 'x' };
    expect(await previewEdit('Edit', input, file('a.ts'))).toEqual({
      creates: false,
      lines: [
        { kind: 'removed', number: 1, text: 'nothing' },
        { kind: 'removed', number: 2, text: 'here' },
        { kind: 'added', number: 1, text: 'x' },
      ],
      moreLines: 0,
    });
  });

  it('AC-8: a Write over a file shows only the lines that change', async () => {
    const input = { file_path: file('a.ts'), content: source.replace('return 1;', 'return 3;') };
    expect(await previewEdit('Write', input, file('a.ts'))).toEqual({
      creates: false,
      lines: [
        { kind: 'removed', number: 4, text: '  return 1;' },
        { kind: 'added', number: 4, text: '  return 3;' },
      ],
      moreLines: 0,
    });
  });

  it('AC-8: a Write of a new file shows every line as added, without a trailing empty one, and says it creates the file', async () => {
    const input = { file_path: file('new.ts'), content: 'x\ny\n' };
    expect(await previewEdit('Write', input, file('new.ts'))).toEqual({
      creates: true,
      lines: [
        { kind: 'added', number: 1, text: 'x' },
        { kind: 'added', number: 2, text: 'y' },
      ],
      moreLines: 0,
    });
  });

  it('Q9: shows at most 20 lines and counts the rest', async () => {
    expect(previewLineLimit).toBe(20);
    const preview = await previewEdit('Write', { file_path: file('long.txt'), content: sixtyLines }, file('long.txt'));
    expect(preview.lines).toHaveLength(20);
    expect(preview.lines.at(-1)).toEqual({ kind: 'added', number: 20, text: 'line 20' });
    expect(preview.moreLines).toBe(40);
  });

  it('AC-8: a NotebookEdit shows its new source as added lines', async () => {
    const input = { notebook_path: file('n.ipynb'), new_source: 'import pandas\ndf = 1' };
    expect(await previewEdit('NotebookEdit', input, file('n.ipynb'))).toEqual({
      creates: false,
      lines: [
        { kind: 'added', number: 1, text: 'import pandas' },
        { kind: 'added', number: 2, text: 'df = 1' },
      ],
      moreLines: 0,
    });
  });

  it('reads at most 1 MB of a file: a bigger one is previewed from the call alone', async () => {
    expect(previewReadLimit).toBe(1024 * 1024);
    const input = { file_path: file('big.txt'), old_string: 'x', new_string: 'y' };
    expect(await previewEdit('Edit', input, file('big.txt'))).toEqual({
      creates: false,
      lines: [
        { kind: 'removed', number: 1, text: 'x' },
        { kind: 'added', number: 1, text: 'y' },
      ],
      moreLines: 0,
    });
  });

  it('shows nothing for a call whose text it cannot read', async () => {
    expect(await previewEdit('Edit', { file_path: file('a.ts') }, file('a.ts'))).toEqual({
      creates: false,
      lines: [],
      moreLines: 0,
    });
  });
});
