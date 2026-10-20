import { useId, type ChangeEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { Image01Icon } from '@hugeicons/core-free-icons';
import {
  Avatar,
  Button,
  buttonVariants,
  cn,
  Dialog,
  DialogContent,
  DialogFoot,
  DialogTitle,
  Field,
  Icon,
  Input,
  Textarea,
} from '@devhub/ui';
import { z } from 'zod';
import { useProfileStore } from '../stores/profile-store.ts';
import { personName } from './person-name.ts';

const profileFormSchema = z.object({
  name: z.string().trim().max(80, 'Keep the name to 80 characters.'),
  bio: z.string().trim().max(160, 'Keep the bio to 160 characters.'),
  picture: z.string().nullable(),
});
type ProfileFormValues = z.infer<typeof profileFormSchema>;

/** Kept this small so the picture fits in the browser's storage many times over. */
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

export interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The name the server knows, shown when the person leaves Name empty. */
  serverName: string | null;
  /** Where focus goes when the dialog closes: the menu that opened it is gone by then. */
  returnFocusTo: () => HTMLElement | null;
}

/** Edit profile: the person's picture, name and bio, kept in this browser only. */
export function ProfileDialog({ open, onOpenChange, serverName, returnFocusTo }: ProfileDialogProps) {
  const titleId = useId();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="narrow"
        aria-labelledby={titleId}
        onOpenAutoFocus={(event) => {
          // Name, not the picture's button that comes first: the words are what people come to change.
          const { currentTarget } = event;
          const name = currentTarget instanceof HTMLElement ? currentTarget.querySelector('input[name="name"]') : null;
          if (!(name instanceof HTMLInputElement)) return;
          event.preventDefault();
          name.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusTo()?.focus();
        }}
      >
        <ProfileForm
          titleId={titleId}
          serverName={serverName}
          onDone={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function ProfileForm({
  titleId,
  serverName,
  onDone,
}: {
  titleId: string;
  serverName: string | null;
  onDone: () => void;
}) {
  const saved = useProfileStore();
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    // Read once: the dialog mounts a fresh form each time it opens.
    defaultValues: { name: saved.name, bio: saved.bio, picture: saved.picture },
  });
  const { errors } = form.formState;
  const picture = useWatch({ control: form.control, name: 'picture' });
  const name = useWatch({ control: form.control, name: 'name' });
  const initials = personName((name.trim() === '' ? serverName : name) ?? '').initials;

  async function choosePicture(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Picking the same file again must still fire a change.
    event.target.value = '';
    if (file === undefined) return;
    try {
      form.setValue('picture', await pictureFrom(file), { shouldDirty: true });
      form.clearErrors('picture');
    } catch {
      form.setError('picture', { message: "That file isn't a picture Orynx can read. Try a PNG or JPEG." });
    }
  }

  return (
    <form
      noValidate
      className="flex min-h-0 flex-col"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          saved.setProfile(values);
          onDone();
        })(event);
      }}
    >
      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto p-6">
        <DialogTitle id={titleId}>Edit profile</DialogTitle>
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
                  aria-describedby={errors.picture ? `${titleId}-picture` : undefined}
                  onChange={(event) => void choosePicture(event)}
                />
                <Icon icon={Image01Icon} aria-hidden />
                {picture === null ? 'Add picture' : 'Change picture'}
              </label>
              {picture === null ? null : (
                <Button
                  variant="ghost"
                  onClick={() => {
                    form.setValue('picture', null, { shouldDirty: true });
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
          {errors.picture?.message === undefined ? null : (
            <p id={`${titleId}-picture`} role="alert" className="m-0 text-small text-danger">
              {errors.picture.message}
            </p>
          )}
        </div>
        <Field
          label="Name"
          help={serverName === null ? undefined : `Leave it empty to use ${serverName}.`}
          error={errors.name?.message}
        >
          <Input autoComplete="name" {...form.register('name')} />
        </Field>
        <Field label="Bio" error={errors.bio?.message}>
          <Textarea rows={3} {...form.register('bio')} />
        </Field>
        <p className="m-0 text-small text-muted-foreground">Saved in this browser only.</p>
      </div>
      <DialogFoot>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Save
        </Button>
      </DialogFoot>
    </form>
  );
}
