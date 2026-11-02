import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClaudeIcon, Tick02Icon } from '@hugeicons/core-free-icons';
import { Avatar } from './avatar.tsx';
import { Button } from './button.tsx';
import { CheckboxBox } from './checkbox.tsx';
import { DiffNote } from './diff-note.tsx';
import { Field } from './field.tsx';
import { Icon } from './icon.tsx';
import { Textarea } from './textarea.tsx';

const meta = {
  title: 'Components/DiffNote',
  component: DiffNote,
  args: { author: 'Claude', mark: <Icon icon={ClaudeIcon} />, 'aria-label': 'Claude on line 42', children: null },
} satisfies Meta<typeof DiffNote>;

export default meta;
type Story = StoryObj<typeof meta>;

const words = 'This drops the error from `save()`: the toast says it saved when it failed.';

const controls = (kept: boolean) => (
  <>
    <CheckboxBox id={`keep-${String(kept)}`} defaultChecked={kept} />
    <label htmlFor={`keep-${String(kept)}`}>Keep</label>
    <Button variant="ghost" size="sm">
      Edit
    </Button>
  </>
);

/** As `session-review.html` draws a reviewer's note, with the band that says what fixed it. */
export const Reviewer: Story = {
  args: {
    'aria-label': 'Priya Shah on line 14',
    mark: <Avatar initials="PS" />,
    author: 'Priya Shah',
    meta: 'reviewed · 5 days ago',
    children: 'useState here makes the whole form re-render on every keystroke. Memoize the defaults.',
    footerTone: 'success',
    footer: (
      <>
        <Icon icon={Tick02Icon} />
        <span>Fixed by Claude: moved the defaults into useMemo.</span>
      </>
    ),
  },
};

/** Claude's draft, kept: it goes with the review (spec 050). */
export const ClaudeKept: Story = { args: { children: words, footer: controls(true) } };

/** Unticked: it stays here, fainter. */
export const ClaudeDropped: Story = { args: { children: words, muted: true, footer: controls(false) } };

/** Edit swaps the words for a text box. */
export const Editing: Story = {
  args: {
    children: (
      <Field label="Comment">
        <Textarea defaultValue={words} rows={3} />
      </Field>
    ),
    footer: (
      <>
        <Button size="sm">Save</Button>
        <Button variant="ghost" size="sm">
          Cancel
        </Button>
      </>
    ),
  },
};

/** Gone to GitHub: no Keep or Edit. */
export const Posted: Story = { args: { children: words, meta: 'Posted' } };
