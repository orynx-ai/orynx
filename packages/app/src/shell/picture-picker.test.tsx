import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PicturePicker } from './picture-picker.tsx';

describe('PicturePicker', () => {
  it('shows the initials and offers Add picture while there is no picture', () => {
    render(<PicturePicker picture={null} initials="AL" error={undefined} onChange={vi.fn()} onError={vi.fn()} />);
    expect(screen.getByText('AL')).toBeVisible();
    expect(screen.getByLabelText('Add picture')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('offers Change picture and Remove for a picture, and Remove empties it', async () => {
    const onChange = vi.fn();
    render(
      <PicturePicker
        picture="data:image/png;base64,AAAA"
        initials="AL"
        error={undefined}
        onChange={onChange}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Change picture')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('says a file is not a picture it can read, and ties the words to the file input', async () => {
    const onError = vi.fn();
    const { rerender } = render(
      <PicturePicker picture={null} initials="AL" error={undefined} onChange={vi.fn()} onError={onError} />,
    );
    await userEvent.upload(screen.getByLabelText('Add picture'), new File(['text'], 'me.png', { type: 'image/png' }));
    expect(onError).toHaveBeenCalledWith("That file isn't a picture Orynx can read. Try a PNG or JPEG.");

    rerender(<PicturePicker picture={null} initials="AL" error="Not a picture" onChange={vi.fn()} onError={onError} />);
    expect(screen.getByLabelText('Add picture')).toHaveAccessibleDescription('Not a picture');
  });
});
