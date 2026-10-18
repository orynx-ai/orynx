import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Folder01Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Button } from './button.tsx';
import { Composer, ComposerBar, ComposerHint, ComposerSend, ComposerTextarea } from './composer.tsx';
import { Menu, MenuContent, MenuItem, MenuTrigger } from './menu.tsx';
import { Picker } from './picker.tsx';
import { Icon } from './icon.tsx';

/** What a screen does with react-hook-form: read the text box when the form is sent. */
function sentText(onSend: (text: string) => void): ComponentProps<'form'>['onSubmit'] {
  return (event) => {
    event.preventDefault();
    const text = new FormData(event.currentTarget).get('task');
    onSend(typeof text === 'string' ? text : '');
  };
}

function HomeComposer({
  onSend = () => undefined,
  canSend,
  pending,
}: {
  onSend?: (text: string) => void;
  canSend?: boolean;
  pending?: boolean;
}) {
  return (
    <Composer onSubmit={sentText(onSend)} canSend={canSend} pending={pending}>
      <ComposerTextarea
        name="task"
        label="Describe a task for Claude"
        placeholder="Describe a task, or paste a Jira key like PROJ-1423"
      />
      <ComposerBar>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Add context">
              <Icon icon={PlusSignIcon} aria-hidden />
            </Button>
          </MenuTrigger>
          <MenuContent aria-label="Add context">
            <MenuItem>Jira ticket</MenuItem>
          </MenuContent>
        </Menu>
        <Picker icon={<Icon icon={Folder01Icon} />}>web-app</Picker>
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

  it('AC-10: with nothing to send, Send stays focusable but reads as unavailable and nothing is sent', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<HomeComposer onSend={onSend} canSend={false} />);

    const send = screen.getByRole('button', { name: 'Send to Claude' });
    expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(send).not.toBeDisabled();
    await user.click(send);
    await user.type(screen.getByRole('textbox', { name: 'Describe a task for Claude' }), '{Enter}');

    expect(onSend).not.toHaveBeenCalled();
  });

  it('AC-10: while a send is on its way, Send ignores presses and the text stays', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<HomeComposer onSend={onSend} pending />);

    const box = screen.getByRole('textbox', { name: 'Describe a task for Claude' });
    await user.type(box, 'Add bulk archive{Enter}');
    const send = screen.getByRole('button', { name: 'Send to Claude' });
    await user.click(send);

    expect(onSend).not.toHaveBeenCalled();
    expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(send).toHaveAttribute('aria-busy', 'true');
    expect(box).toHaveValue('Add bulk archive');
  });

  it('AC-11: where the browser sizes the text box to its text itself, the Composer leaves its height alone', async () => {
    const user = userEvent.setup();
    render(<HomeComposer />);
    const box = screen.getByRole('textbox', { name: 'Describe a task for Claude' });

    await user.type(box, 'a');

    expect(box.style.height).toBe('');
  });

  it('AC-11: where the browser cannot size the text box to its text, it grows to 8 lines and no further', async () => {
    // As Firefox does: no CSS field-sizing.
    const supports = vi.spyOn(CSS, 'supports').mockReturnValue(false);
    onTestFinished(() => {
      supports.mockRestore();
    });
    const user = userEvent.setup();
    render(<HomeComposer />);
    const box = screen.getByRole('textbox', { name: 'Describe a task for Claude' });

    // jsdom lays nothing out, so give the text box the heights a browser would measure.
    Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 104 });
    await user.type(box, 'a');
    expect(box.style.height).toBe('104px');

    Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 600 });
    await user.type(box, 'b');
    expect(box.style.height).toBe('200px');
  });

  it('AC-14: the follow-up box has one line, the hint and Send, and no pickers', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const { container } = render(
      <Composer look="follow-up" onSubmit={sentText(onSend)}>
        <ComposerTextarea name="task" label="Message Claude" placeholder="Ask Claude to change something" />
        <ComposerBar>
          <ComposerHint>Enter to send · Shift+Enter for a new line</ComposerHint>
          <ComposerSend label="Send message" />
        </ComposerBar>
      </Composer>,
    );

    const box = screen.getByRole('textbox', { name: 'Message Claude' });
    expect(box).toHaveAttribute('rows', '1');
    expect(screen.getByText('Enter to send · Shift+Enter for a new line')).toBeVisible();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    await expectNoAxeViolations(container);

    await user.type(box, 'Use the shared toast{Enter}');
    expect(onSend).toHaveBeenCalledWith('Use the shared toast');
  });

  it('AC-11: where the browser cannot size the text box, it also fits text set by code: on mount and after a reset', async () => {
    const supports = vi.spyOn(CSS, 'supports').mockReturnValue(false);
    // jsdom lays nothing out, so give text boxes the height a browser would measure.
    const measured = vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(104);
    onTestFinished(() => {
      supports.mockRestore();
      measured.mockRestore();
    });
    render(
      <Composer>
        <ComposerTextarea
          label="Describe a task for Claude"
          defaultValue={'Add bulk archive\nwith undo\nand a toast'}
        />
      </Composer>,
    );
    const box = screen.getByRole('textbox', { name: 'Describe a task for Claude' });
    expect(box.style.height).toBe('104px');

    // react-hook-form's reset() after a send resets the form, which changes the text without typing.
    measured.mockReturnValue(56);
    box.closest('form')?.reset();
    await waitFor(() => {
      expect(box.style.height).toBe('56px');
    });
  });

  it('AC-10: an unavailable Send ignores presses without telling the screen', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Composer canSend={false}>
        <ComposerTextarea label="Describe a task for Claude" />
        <ComposerBar>
          <ComposerSend label="Send to Claude" onClick={onClick} />
        </ComposerBar>
      </Composer>,
    );

    await user.click(screen.getByRole('button', { name: 'Send to Claude' }));

    expect(onClick).not.toHaveBeenCalled();
  });
});
