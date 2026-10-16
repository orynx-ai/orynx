import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Kbd } from './kbd.tsx';

describe('Kbd', () => {
  it('renders the shortcut in a kbd element', () => {
    render(<Kbd>⌘K</Kbd>);
    expect(screen.getByText('⌘K').tagName).toBe('KBD');
  });
});
