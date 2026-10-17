import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Field } from './field.tsx';
import { Input } from './input.tsx';

describe('Field', () => {
  it('AC-2: names its input with a visible label and describes it with the help line', async () => {
    render(
      <Field label="Jira site" help="The address you open Jira at, like your-team.atlassian.net.">
        <Input />
      </Field>,
    );

    const input = screen.getByRole('textbox', { name: 'Jira site' });
    expect(input).toHaveAccessibleDescription('The address you open Jira at, like your-team.atlassian.net.');
    expect(input).not.toHaveAttribute('aria-invalid');

    await userEvent.click(screen.getByText('Jira site'));
    expect(input).toHaveFocus();
  });

  it('AC-7: puts the error in place of the help line and marks the input invalid', () => {
    render(
      <Field label="Email" help="The email you sign in to Jira with." error="Enter the email you sign in to Jira with.">
        <Input type="email" />
      </Field>,
    );

    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter the email you sign in to Jira with.');
    expect(screen.queryByText('The email you sign in to Jira with.')).not.toBeInTheDocument();
  });

  it('AC-16: keeps a link in the help line reachable from the keyboard', async () => {
    render(
      <Field
        label="API token"
        help={
          <>
            Create one in your Atlassian account settings. <a href="https://id.atlassian.com/">Create an API token</a>
          </>
        }
      >
        <Input type="password" autoComplete="off" />
      </Field>,
    );

    await userEvent.tab();
    expect(screen.getByLabelText('API token')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('link', { name: 'Create an API token' })).toHaveFocus();
  });

  it.each([null, false, ''])('treats an error of %j as no error, so `error={failed && message}` is safe', (error) => {
    render(
      <Field label="Email" help="The email you sign in to Jira with." error={error}>
        <Input type="email" />
      </Field>,
    );

    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).toHaveAccessibleDescription('The email you sign in to Jira with.');
  });

  it('keeps a link that the error carries reachable', () => {
    render(
      <Field
        label="API token"
        error={
          <>
            Jira didn&apos;t accept this email and API token.{' '}
            <a href="https://id.atlassian.com/">Create an API token</a>
          </>
        }
      >
        <Input type="password" />
      </Field>,
    );

    expect(screen.getByLabelText('API token')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('link', { name: 'Create an API token' })).toBeVisible();
  });

  it('gives its input the id the field was given', () => {
    render(
      <Field id="jira-site" label="Jira site">
        <Input />
      </Field>,
    );
    expect(screen.getByRole('textbox', { name: 'Jira site' })).toHaveAttribute('id', 'jira-site');
  });

  it('has no accessibility violations with help, with an error, and with neither', async () => {
    const { container } = render(
      <>
        <Field label="Jira site" help="The address you open Jira at.">
          <Input />
        </Field>
        <Field label="Email" error="Enter the email you sign in to Jira with.">
          <Input type="email" />
        </Field>
        <Field label="API token">
          <Input type="password" />
        </Field>
      </>,
    );
    await expectNoAxeViolations(container);
  });
});
