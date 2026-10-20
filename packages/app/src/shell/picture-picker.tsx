import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import { Delete02Icon, PencilEdit02Icon } from '@hugeicons/core-free-icons';
import {
  Avatar,
  Button,
  buttonVariants,
  cn,
  Dialog,
  DialogContent,
  DialogFoot,
  DialogTitle,
  Icon,
  IconButton,
  Slider,
  Tooltip,
} from '@devhub/ui';

/** Kept this small so the picture is a few kilobytes in settings.json and on the wire. */
const pictureSize = 256;

/** `area` of the picture, in its own pixels, drawn at {@link pictureSize} px as a `data:` URL. */
function pictureFrom(image: ImageBitmap, area: Area): string {
  const canvas = document.createElement('canvas');
  canvas.width = pictureSize;
  canvas.height = pictureSize;
  canvas.getContext('2d')?.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, pictureSize, pictureSize);
  // WebP keeps a picture's transparency; a browser without it gives PNG instead.
  return canvas.toDataURL('image/webp', 0.9);
}

/** The middle square: what Apply crops to before the cropper has measured the picture. */
function middleSquare(image: ImageBitmap): Area {
  const side = Math.min(image.width, image.height);
  return { x: (image.width - side) / 2, y: (image.height - side) / 2, width: side, height: side };
}

// icon-buttons-ignore-next-line: the file input's label, drawn in a Tooltip that holds its words
const editLook = buttonVariants({ variant: 'secondary', size: 'icon-sm' });

export interface PicturePickerProps {
  picture: string | null;
  /** Shown while there is no picture. */
  initials: string;
  error: string | undefined;
  onChange: (picture: string | null) => void;
  onError: (message: string) => void;
  /** Crop picture opened or closed: a dialog under it steps out of sight, so only the cropper shows. */
  onCropping?: (cropping: boolean) => void;
}

/**
 * The person's picture, centred, for Edit profile and Set up Orynx (spec 043). Its edit and remove buttons show on
 * hover or focus, and always on a touch screen. A picked file opens Crop picture, a dialog of its own, first (the
 * user's call, 20 Oct 2026).
 */
export function PicturePicker({ picture, initials, error, onChange, onError, onCropping }: PicturePickerProps) {
  const errorId = useId();
  const [picked, pick] = useState<{ image: ImageBitmap; url: string } | null>(null);
  const setPicked = (next: typeof picked) => {
    pick(next);
    onCropping?.(next !== null);
  };
  const fileInput = useRef<HTMLInputElement>(null);
  const cropTitleId = useId();
  const edit = picture === null ? 'Add picture' : 'Change picture';

  useEffect(() => {
    if (picked === null) return;
    return () => {
      picked.image.close();
      URL.revokeObjectURL(picked.url);
    };
  }, [picked]);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Picking the same file again must still fire a change.
    event.target.value = '';
    if (file === undefined) return;
    try {
      setPicked({ image: await createImageBitmap(file), url: URL.createObjectURL(file) });
    } catch {
      onError("That file isn't a picture Orynx can read. Try a PNG or JPEG.");
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="group relative">
        <Avatar size="2xl" initials={initials} src={picture} />
        <div className="absolute inset-x-0 -bottom-2 flex justify-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
          <Tooltip label={edit}>
            {/* A label, so the file input itself is what a screen reader and the keyboard reach. */}
            <label
              className={cn(
                editLook,
                'rounded-full has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
              )}
            >
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="sr-only"
                aria-describedby={error === undefined ? undefined : errorId}
                onChange={(event) => void choose(event)}
              />
              <Icon icon={PencilEdit02Icon} aria-hidden />
              <span className="sr-only">{edit}</span>
            </label>
          </Tooltip>
          {picture === null ? null : (
            <IconButton
              label="Remove picture"
              variant="secondary"
              size="sm"
              className="rounded-full"
              onClick={() => {
                onChange(null);
              }}
            >
              <Icon icon={Delete02Icon} aria-hidden />
            </IconButton>
          )}
        </div>
      </div>
      {error === undefined ? null : (
        <p id={errorId} role="alert" className="m-0 text-small text-danger">
          {error}
        </p>
      )}
      <Dialog
        open={picked !== null}
        onOpenChange={(open) => {
          if (!open) setPicked(null);
        }}
      >
        {picked === null ? null : (
          <DialogContent
            size="narrow"
            aria-labelledby={cropTitleId}
            onCloseAutoFocus={(event) => {
              // Opened by the file input, not a trigger: back to it.
              event.preventDefault();
              fileInput.current?.focus();
            }}
          >
            <CropPicture
              titleId={cropTitleId}
              image={picked.image}
              url={picked.url}
              onCancel={() => {
                setPicked(null);
              }}
              onApply={(area) => {
                onChange(pictureFrom(picked.image, area));
                setPicked(null);
              }}
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

/** Crop picture, over the form: drag or the arrow keys move the picture under the circle; Zoom brings it closer. */
function CropPicture({
  titleId,
  image,
  url,
  onCancel,
  onApply,
}: {
  titleId: string;
  image: ImageBitmap;
  url: string;
  onCancel: () => void;
  onApply: (area: Area) => void;
}) {
  const zoomId = useId();
  // The cropper's own view, not a form value: nothing is saved until Apply draws the picture.
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const area = useRef<Area | null>(null);

  return (
    <>
      <div className="flex flex-col gap-4 p-6">
        <DialogTitle id={titleId}>Crop picture</DialogTitle>
        <div className="relative h-72 w-full overflow-hidden rounded-md bg-subtle">
          <Cropper
            image={url}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => {
              area.current = pixels;
            }}
            cropperProps={{ role: 'group', 'aria-label': 'Picture to crop: drag it, or use the arrow keys' }}
          />
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor={zoomId} className="text-small text-muted-foreground">
            Zoom
          </label>
          <Slider
            id={zoomId}
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            aria-valuetext={`${String(Math.round(zoom * 100))}%`}
            onChange={(event) => {
              setZoom(Number(event.target.value));
            }}
          />
        </div>
      </div>
      <DialogFoot>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            onApply(area.current ?? middleSquare(image));
          }}
        >
          Apply
        </Button>
      </DialogFoot>
    </>
  );
}
