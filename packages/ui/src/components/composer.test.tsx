import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Folder, Plus } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Button } from './button.tsx';
import { Composer, ComposerBar, ComposerSend, ComposerTextarea } from './composer.tsx';
import { Menu, MenuContent, MenuItem, MenuTrigger } from './menu.tsx';
import { Picker } from './picker.tsx';

/** What a screen does with react-hook-form: read the text box when the form is sent. */
function sentText(onSend: (text: string) => void): ComponentProps<'form'>['onSubmit'] {
  return (event) => {
    event.preventDefault();
    const text = new FormData(event.currentTarget).get('task');
    onSend(typeof text === 'string' ? text : '');
  };
}

function HomeComposer({ onSend = () => undefined }: { onSend?: (text: string) => void }) {
  return (
    <Composer onSubmit={sentText(onSend)}>
      <ComposerTextarea
        name="task"
        label="Describe a task for Claude"
        placeholder="Describe a task, or paste a Jira key like PROJ-1423"
      />
      <ComposerBar>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Add context">
              <Plus aria-hidden />
            </Button>
          </MenuTrigger>
          <MenuContent aria-label="Add context">
            <MenuItem>Jira ticket</MenuItem>
          </MenuContent>
        </Menu>
        <Picker icon={<Folder />}>web-app</Picker>
        <Picker icon={<span aria-hidden className="size-2 rounded-full bg-success" />}>Claude</Picker>
        <ComposerSend label="Send to Claude" />
      </ComposerBar>
    </Composer>
  );
}

describe('Composer', () => {
  it('AC-8: is a form with a labelled text box, + Add context, the pickers and a named Send', async () => {
    const { container } = render(<HomeComposer />);

    const box = screen.getByRole('textbox', { name: 'Describe a task for Claude' });
    expect(box).toHaveAttribute('placeholder', 'Describe a task, or paste a Jira key like PROJ-1423');
    expect(screen.getByRole('button', { name: 'Add context' })).toHaveAttribute('aria-haspopup', 'menu');
    expect(screen.getByRole('button', { name: 'web-app' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Claude' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Send to Claude' })).toHaveAttribute('type', 'submit');
    await expectNoAxeViolations(container);
  });

  it('AC-9: Enter sends the form once with the text', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<HomeComposer onSend={onSend} />);

    await user.type(screen.getByRole('textbox', { name: 'Describe a task for Claude' }), 'Add bulk archive{Enter}');

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('Add bulk archive');
  });

  it('AC-9: Shift+Enter adds a new line instead of sending', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<HomeComposer onSend={onSend} />);

    const box = screen.getByRole('textbox', { name: 'Describe a task for Claude' });
    await user.type(box, 'First line{Shift>}{Enter}{/Shift}Second line');

    expect(box).toHaveValue('First line\nSecond line');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('AC-9: Enter while an input method is still composing does not send', () => {
    const onSend = vi.fn();
    render(<HomeComposer onSend={onSend} />);

    const box = screen.getByRole('textbox', { name: 'Describe a task for Claude' });
    fireEvent.change(box, { target: { value: 'にほんご' } });
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
    // Safari ends composition before the keydown but still reports key code 229.
    fireEvent.keyDown(box, { key: 'Enter', keyCode: 229 });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('AC-8: pressing Send sends the form', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<HomeComposer onSend={onSend} />);

    await user.type(screen.getByRole('textbox', { name: 'Describe a task for Claude' }), 'Fix the timezone shift');
    await user.click(screen.getByRole('button', { name: 'Send to Claude' }));

    expect(onSend).toHaveBeenCalledWith('Fix the timezone shift');
  });
});
