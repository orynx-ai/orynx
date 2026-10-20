import { useId, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { ArrowDown01Icon } from '@hugeicons/core-free-icons';
import { Button, Dialog, DialogContent, DialogFoot, DialogTitle, Field, Icon, Input, Textarea } from '@devhub/ui';
import { ApiRequestError } from '@devhub/api-client';
import { passwordMaxLength, passwordMinLength, type Profile } from '@devhub/contracts';
import { z } from 'zod';
import { personName } from './person-name.ts';
import { PicturePicker } from './picture-picker.tsx';
import { useChangePassword, useProfile, useSaveProfile } from './profile-queries.ts';

const profileFormSchema = z
  .object({
    name: z.string().trim().max(80, 'Keep the name to 80 characters.'),
    bio: z.string().trim().max(160, 'Keep the bio to 160 characters.'),
    picture: z.string().nullable(),
    // Both empty: the password stays as it is.
    current: z.string(),
    next: z
      .string()
      .refine((next) => next === '' || next.length >= passwordMinLength, {
        message: `Use at least ${String(passwordMinLength)} characters.`,
      })
      .refine((next) => next.length <= passwordMaxLength, {
        message: `Keep the password to ${String(passwordMaxLength)} characters.`,
      }),
  })
  .refine((values) => values.next === '' || values.current !== '', {
    path: ['current'],
    message: 'Enter your current password.',
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
  // Crop picture opens over this one; the page's backdrop lets this taller dialog show past it, so it steps out of sight.
  const [cropping, setCropping] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="narrow"
        aria-labelledby={titleId}
        className={cropping ? 'invisible' : undefined}
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
            onCropping={setCropping}
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
  onCropping,
  onDone,
}: {
  titleId: string;
  serverName: string | null;
  saved: Profile;
  onCropping: (cropping: boolean) => void;
  onDone: () => void;
}) {
  const save = useSaveProfile();
  const changePassword = useChangePassword();
  // Closed at first, so the dialog stays about the profile; the fields' values live in the form.
  const [passwordOpen, setPasswordOpen] = useState(false);
  const passwordId = useId();
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    // Read once: the dialog mounts a fresh form each time it opens.
    defaultValues: { ...saved, current: '', next: '' },
  });
  const forgetPassword = () => {
    form.resetField('current');
    form.resetField('next');
    changePassword.reset();
  };
  // A wrong current password shows on its field; anything else, once, under the fields.
  const failed = [changePassword.error, save.error].find(
    (error): error is ApiRequestError => error !== null && error.code !== 'wrong_password',
  );
  const { errors } = form.formState;
  const picture = useWatch({ control: form.control, name: 'picture' });
  const name = useWatch({ control: form.control, name: 'name' });
  const initials = personName((name.trim() === '' ? serverName : name) ?? '').initials;

  return (
    <form
      noValidate
      className="flex min-h-0 flex-col"
      onSubmit={(event) => {
        void form.handleSubmit(async ({ current, next, ...profile }) => {
          // The password first: a wrong current one keeps the dialog open with nothing saved.
          if (next !== '') {
            const changed = await changePassword.mutateAsync({ current, next }).then(
              () => true,
              (error: unknown) => {
                if (error instanceof ApiRequestError && error.code === 'wrong_password') {
                  form.setError('current', { message: error.message }, { shouldFocus: true });
                }
                return false;
              },
            );
            if (!changed) return;
            // A second Save, after a profile that didn't save, mustn't send the password again.
            forgetPassword();
            setPasswordOpen(false);
          }
          save.mutate(profile, { onSuccess: onDone });
        })(event);
      }}
    >
      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto p-6">
        <DialogTitle id={titleId}>Edit profile</DialogTitle>
        <PicturePicker
          picture={picture}
          initials={initials}
          onCropping={onCropping}
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
        <div className="flex flex-col gap-4">
          <Button
            variant="ghost"
            size="sm"
            className="-ms-3 self-start"
            aria-expanded={passwordOpen}
            aria-controls={passwordId}
            onClick={() => {
              if (passwordOpen) forgetPassword();
              setPasswordOpen(!passwordOpen);
            }}
          >
            Change password
            <Icon icon={ArrowDown01Icon} aria-hidden className={passwordOpen ? 'rotate-180' : undefined} />
          </Button>
          {passwordOpen ? (
            <div id={passwordId} className="flex flex-col gap-5">
              <Field label="Current password" error={errors.current?.message}>
                <Input type="password" autoComplete="current-password" {...form.register('current')} />
              </Field>
              <Field
                label="New password"
                help={`At least ${String(passwordMinLength)} characters. Your other devices ask for it again.`}
                error={errors.next?.message}
              >
                <Input type="password" autoComplete="new-password" {...form.register('next')} />
              </Field>
            </div>
          ) : null}
        </div>
        {failed === undefined ? null : (
          <p role="alert" className="m-0 text-small text-danger">
            {failed.message}
          </p>
        )}
      </div>
      <DialogFoot>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={save.isPending || changePassword.isPending}>
          Save
        </Button>
      </DialogFoot>
    </form>
  );
}
