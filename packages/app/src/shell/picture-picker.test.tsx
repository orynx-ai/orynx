import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PicturePicker } from './picture-picker.tsx';

const photo = () => new File(['pixels'], 'me.png', { type: 'image/png' });

/**
 * jsdom decodes no pictures and draws nothing, so the browser's own image calls stand in: a 200 × 100 picture, and a
 * canvas that says what it drew. The real crop is drawn in e2e/smoke.spec.ts.
 */
function fakePictureApis() {
  const close = vi.fn();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(() => Promise.resolve({ width: 200, height: 100, close })),
  );
  const revoke = vi.fn();
  vi.stubGlobal(
    'URL',
    Object.assign(class extends URL {}, { createObjectURL: () => 'blob:me', revokeObjectURL: revoke }),
  );
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as null);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,AAAA');
  return { close, drawImage, revoke };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PicturePicker', () => {
  it('shows the initials and offers Add picture while there is no picture, and no Remove', () => {
    render(<PicturePicker picture={null} initials="AL" error={undefined} onChange={vi.fn()} onError={vi.fn()} />);
    expect(screen.getByText('AL')).toBeVisible();
    expect(screen.getByLabelText('Add picture')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove picture' })).toBeNull();
  });

  it('offers Change picture and Remove picture for a picture, and Remove picture empties it', async () => {
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
    await userEvent.click(screen.getByRole('button', { name: 'Remove picture' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('opens Crop picture for a picked file: Apply draws the middle square at 256 px', async () => {
    const { close, drawImage, revoke } = fakePictureApis();
    const onChange = vi.fn();
    render(<PicturePicker picture={null} initials="AL" error={undefined} onChange={onChange} onError={vi.fn()} />);

    await userEvent.upload(screen.getByLabelText('Add picture'), photo());

    const crop = await screen.findByRole('dialog', { name: 'Crop picture' });
    expect(crop).toContainElement(document.activeElement as HTMLElement);
    expect(within(crop).getByRole('slider', { name: 'Zoom' })).toHaveValue('1');
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(within(crop).getByRole('button', { name: 'Apply' }));

    // jsdom measures nothing, so the cropper never reports an area and Apply takes the middle square.
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 50, 0, 100, 100, 0, 0, 256, 256);
    expect(onChange).toHaveBeenCalledWith('data:image/webp;base64,AAAA');
    expect(screen.queryByRole('dialog', { name: 'Crop picture' })).toBeNull();
    expect(screen.getByLabelText('Add picture')).toHaveFocus();
    expect(close).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:me');
  });

  it('keeps the picture as it was when Crop picture is cancelled, or closed with Escape', async () => {
    fakePictureApis();
    const onChange = vi.fn();
    render(<PicturePicker picture={null} initials="AL" error={undefined} onChange={onChange} onError={vi.fn()} />);

    await userEvent.upload(screen.getByLabelText('Add picture'), photo());
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Crop picture' })).getByRole('button', { name: 'Cancel' }),
    );

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Add picture')).toHaveFocus();

    await userEvent.upload(screen.getByLabelText('Add picture'), photo());
    await screen.findByRole('dialog', { name: 'Crop picture' });
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Crop picture' })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Add picture')).toHaveFocus();
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
