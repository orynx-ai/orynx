import { useId, type ChangeEvent } from 'react';
import { Image01Icon } from '@hugeicons/core-free-icons';
import { Avatar, Button, buttonVariants, cn, Icon } from '@devhub/ui';

/** Kept this small so the picture is a few kilobytes in settings.json and on the wire. */
const pictureSize = 256;

/** The picked file cut to its middle square and drawn at {@link pictureSize} px, as a `data:` URL. */
async function pictureFrom(file: File): Promise<string> {
  const image = await createImageBitmap(file);
  const side = Math.min(image.width, image.height);
  const canvas = document.createElement('canvas');
  canvas.width = pictureSize;
  canvas.height = pictureSize;
  const left = (image.width - side) / 2;
  const top = (image.height - side) / 2;
  canvas.getContext('2d')?.drawImage(image, left, top, side, side, 0, 0, pictureSize, pictureSize);
  image.close();
  // WebP keeps a picture's transparency; a browser without it gives PNG instead.
  return canvas.toDataURL('image/webp', 0.9);
}

export interface PicturePickerProps {
  picture: string | null;
  /** Shown while there is no picture. */
  initials: string;
  error: string | undefined;
  onChange: (picture: string | null) => void;
  onError: (message: string) => void;
}

/** The person's picture with Add picture, Change picture and Remove: Edit profile and Set up Orynx (spec 043). */
export function PicturePicker({ picture, initials, error, onChange, onError }: PicturePickerProps) {
  const errorId = useId();

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Picking the same file again must still fire a change.
    event.target.value = '';
    if (file === undefined) return;
    try {
      onChange(await pictureFrom(file));
    } catch {
      onError("That file isn't a picture Orynx can read. Try a PNG or JPEG.");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-4">
        <Avatar size="xl" initials={initials} src={picture} />
        <div className="flex flex-wrap gap-2">
          {/* A label, so the file input itself is what a screen reader and the keyboard reach. */}
          <label
            className={cn(
              buttonVariants({ variant: 'secondary' }),
              'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
            )}
          >
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              aria-describedby={error === undefined ? undefined : errorId}
              onChange={(event) => void choose(event)}
            />
            <Icon icon={Image01Icon} aria-hidden />
            {picture === null ? 'Add picture' : 'Change picture'}
          </label>
          {picture === null ? null : (
            <Button
              variant="ghost"
              onClick={() => {
                onChange(null);
              }}
            >
              Remove
            </Button>
          )}
        </div>
      </div>
      {error === undefined ? null : (
        <p id={errorId} role="alert" className="m-0 text-small text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
