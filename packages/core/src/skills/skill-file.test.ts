import { describe, expect, it } from 'vitest';
import { readSkillFile, writeSkillFile } from './skill-file.ts';

const designFile = [
  '---',
  'name: bug-bash',
  'description: Hunt for bugs in the code a ticket touches and list each one with steps to reproduce.',
  'metadata:',
  '  title: Bug bash',
  '---',
  '',
  '# Bug bash',
  '',
  '1. Read the ticket and its acceptance criteria.',
  '',
].join('\n');

describe('readSkillFile', () => {
  it('AC-5: reads the Name from metadata.title, "When to use it" from description, and the instructions after', () => {
    expect(readSkillFile(designFile, 'bug-bash')).toEqual({
      title: 'Bug bash',
      description: 'Hunt for bugs in the code a ticket touches and list each one with steps to reproduce.',
      instructions: '# Bug bash\n\n1. Read the ticket and its acceptance criteria.\n',
      frontmatter: {
        name: 'bug-bash',
        description: 'Hunt for bugs in the code a ticket touches and list each one with steps to reproduce.',
        metadata: { title: 'Bug bash' },
      },
    });
  });

  it('AC-18: shows the folder as the Name when the file has no title, and no description when it has none', () => {
    const skill = readSkillFile('---\nname: review\n---\nCheck the diff.\n', 'review');
    expect(skill).toMatchObject({ title: 'review', description: '', instructions: 'Check the diff.\n' });
  });

  it('reads a description written over several lines, and Windows line ends', () => {
    const skill = readSkillFile('---\r\nname: x\r\ndescription: >\r\n  Two\r\n  lines\r\n---\r\n\r\nGo.\r\n', 'x');
    expect(skill).toMatchObject({ description: 'Two lines', instructions: 'Go.\r\n' });
  });

  it('ignores a title or description that is not text', () => {
    const skill = readSkillFile('---\ndescription: 42\nmetadata:\n  title: [a]\n---\nGo.\n', 'x');
    expect(skill).toMatchObject({ title: 'x', description: '' });
  });

  it('AC-17: reads nothing from a file without frontmatter, with broken YAML, or whose frontmatter is not a map', () => {
    expect(readSkillFile('# Just Markdown\n', 'x')).toBeNull();
    expect(readSkillFile('---\nname: x\nno end\n', 'x')).toBeNull();
    expect(readSkillFile('---\nname: [x\n---\nGo.\n', 'x')).toBeNull();
    expect(readSkillFile('---\n- a\n- b\n---\nGo.\n', 'x')).toBeNull();
    expect(readSkillFile('---\nname: x\nname: y\n---\nGo.\n', 'x')).toBeNull();
  });
});

describe('writeSkillFile', () => {
  const skill = {
    folder: 'bug-bash',
    title: 'Bug bash',
    description: 'Hunt for bugs.',
    instructions: '# Bug bash\n\nReport only.\n',
  };

  it("AC-5: writes Claude Code's name and description, the Name under metadata, a blank line, then the instructions", () => {
    expect(writeSkillFile(skill, {})).toBe(
      '---\nname: bug-bash\ndescription: Hunt for bugs.\nmetadata:\n  title: Bug bash\n---\n\n# Bug bash\n\nReport only.\n',
    );
  });

  it('reads back what it wrote, whatever the Name and description hold', () => {
    const tricky = {
      folder: 'bug-bash-1',
      title: 'Bug: bash #1 — "quoted"',
      description: `${'A long description that would fold. '.repeat(10)}\nand: a second line`,
      instructions: '---\nnot frontmatter\n',
    };
    expect(readSkillFile(writeSkillFile(tricky, {}), 'bug-bash-1')).toMatchObject({
      title: tricky.title,
      description: tricky.description,
      instructions: tricky.instructions,
    });
  });

  it('AC-18: keeps frontmatter Orynx does not know, and replaces name, description and title', () => {
    const before = { name: 'old', description: 'old', license: 'MIT', metadata: { title: 'Old', team: 'web' } };
    const written = writeSkillFile(skill, before);
    expect(readSkillFile(written, 'bug-bash')?.frontmatter).toEqual({
      name: 'bug-bash',
      description: 'Hunt for bugs.',
      license: 'MIT',
      metadata: { title: 'Bug bash', team: 'web' },
    });
  });

  it('replaces a metadata that is not a map', () => {
    const written = writeSkillFile(skill, { metadata: 'odd' });
    expect(readSkillFile(written, 'bug-bash')?.frontmatter['metadata']).toEqual({ title: 'Bug bash' });
  });
});
