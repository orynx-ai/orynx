import { useId } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { Button, Dialog, DialogContent, DialogFoot, DialogTitle, Field, Input, Textarea } from '@devhub/ui';
import type { Profile } from '@devhub/contracts';
import { z } from 'zod';
import { personName } from './person-name.ts';
import { PicturePicker } from './picture-picker.tsx';
import { useProfile, useSaveProfile } from './profile-queries.ts';

const profileFormSchema = z.object({
  name: z.string().trim().max(80, 'Keep the name to 80 characters.'),
  bio: z.string().trim().max(160, 'Keep the bio to 160 characters.'),
  picture: z.string().nullable(),
});
type ProfileFormValues = z.infer<typeof profileFormSchema>;

export interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The name the server knows, shown when the person leaves Name empty. */
  serverName: string | null;
  /** Where focus goes when the dialog closes: the menu that opened it is gone by then. */
  returnFocusTo: () => HTMLElement | null;
}

/** Edit profile: the person's picture, name and bio, saved on the server for every device (spec 043). */
export function ProfileDialog({ open, onOpenChange, serverName, returnFocusTo }: ProfileDialogProps) {
  const titleId = useId();
  const profile = useProfile();
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
        {profile.data === undefined ? (
          // The footer read the profile long before its menu could open this; only a failed read lands here.
          <div className="flex flex-col gap-5 p-6">
            <DialogTitle id={titleId}>Edit profile</DialogTitle>
            <p role="alert" className="m-0 text-danger">
              Orynx couldn’t read your profile. Close this and try again.
            </p>
          </div>
        ) : (
          <ProfileForm
            titleId={titleId}
            serverName={serverName}
            saved={profile.data}
            onDone={() => {
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProfileForm({
  titleId,
  serverName,
  saved,
  onDone,
}: {
  titleId: string;
  serverName: string | null;
  saved: Profile;
  onDone: () => void;
}) {
  const save = useSaveProfile();
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    // Read once: the dialog mounts a fresh form each time it opens.
    defaultValues: saved,
  });
  const { errors } = form.formState;
  const picture = useWatch({ control: form.control, name: 'picture' });
  const name = useWatch({ control: form.control, name: 'name' });
  const initials = personName((name.trim() === '' ? serverName : name) ?? '').initials;

  return (
    <form
      noValidate
      className="flex min-h-0 flex-col"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          save.mutate(values, { onSuccess: onDone });
        })(event);
      }}
    >
      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto p-6">
        <DialogTitle id={titleId}>Edit profile</DialogTitle>
        <PicturePicker
          picture={picture}
          initials={initials}
          error={errors.picture?.message}
          onChange={(next) => {
            form.setValue('picture', next, { shouldDirty: true });
            form.clearErrors('picture');
          }}
          onError={(message) => {
            form.setError('picture', { message });
          }}
        />
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
        {save.error === null ? null : (
          <p role="alert" className="m-0 text-small text-danger">
            {save.error.message}
          </p>
        )}
      </div>
      <DialogFoot>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={save.isPending}>
          Save
        </Button>
      </DialogFoot>
    </form>
  );
}
