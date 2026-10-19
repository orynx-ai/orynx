import type { SkillFolder } from '@devhub/contracts';

export interface StarterSkill {
  folder: SkillFolder;
  title: string;
  description: string;
  instructions: string;
}

/** Add the starter skills (spec 023, Q9): the four skills the Settings › Skills design shows, in its words. */
export const starterSkills: readonly StarterSkill[] = [
  {
    folder: 'bug-bash',
    title: 'Bug bash',
    description: 'Hunt for bugs in the code a ticket touches and list each one with steps to reproduce.',
    instructions: `# Bug bash

1. Read the ticket and its acceptance criteria.
2. Find the files and functions the ticket touches.
3. Run the existing tests for those files.
4. Look for unhandled errors, missing empty states,
   off-by-one limits, race conditions and missing auth checks.
5. For each bug write:
   - Title, one line
   - Where: file and line
   - Steps to reproduce
   - Severity: blocking, should fix, or nit

Do not change any code. Report only.
`,
  },
  {
    folder: 'how-we-review',
    title: 'How we review',
    description: 'Review a pull request the way our team does: correctness, tests, readability, then nits.',
    instructions: `# How we review

You get the ticket, its acceptance criteria and the diff.
You do not get the author's notes. Judge the code, not the story.

1. Does the change meet every acceptance criterion?
2. Are there tests for the new behaviour and the edge cases?
3. Could this break something outside the diff?
4. Is it readable by someone new to this file?

Label each finding blocking, should fix or nit,
with file and line. No praise, no summary of the diff.
`,
  },
  {
    folder: 'write-tests-first',
    title: 'Write tests first',
    description: 'Write a failing test for each acceptance criterion before changing any code.',
    instructions: `# Write tests first

1. Turn each acceptance criterion into a test.
2. Run them and confirm they fail for the right reason.
3. Then change the code until they pass.
4. Do not edit a test to make it pass.
`,
  },
  {
    folder: 'explain-this-code',
    title: 'Explain this code',
    description: 'Explain how a part of the codebase works, for someone new to it.',
    instructions: `# Explain this code

Start from the entry point. Name each file you read.
Keep it under 300 words. Do not change code.
`,
  },
];
