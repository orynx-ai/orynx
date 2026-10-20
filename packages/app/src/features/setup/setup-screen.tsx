// Design: none — docs/design/screens has no first-run screen; Edit profile's fields and two password fields in one centred column (spec 043)
import { useId, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { BrandMark, Button, Field, Input, Textarea } from '@devhub/ui';
import { useStatus } from '../settings/queries.ts';
import { mainContentId } from '../../shell/main-content.ts';
import { personName } from '../../shell/person-name.ts';
import { PicturePicker } from '../../shell/picture-picker.tsx';
import { forgetOldBrowserProfile, oldBrowserProfile } from './old-profile.ts';
import { useCompleteSetup } from './queries.ts';
import { setupFormSchema, type SetupFormValues } from './schemas.ts';

/**
 * Set up Orynx (spec 043): shown in place of the app until a password is saved. The password guards
 * https://orynx.local; this computer never asks for it.
 */
export function SetupScreen() {
  const status = useStatus();

  return (
    <div className="flex min-h-dvh justify-center bg-canvas px-4 py-12 text-foreground">
      <main id={mainContentId} tabIndex={-1} className="flex w-full max-w-md flex-col gap-6 outline-none">
        {/* The whole page at once: Name is filled in from the status, read once when the form mounts. */}
        {status.isPending ? null : <SetupForm serverName={status.data?.user.name ?? null} />}
      </main>
    </div>
  );
}

function SetupForm({ serverName }: { serverName: string | null }) {
  const titleId = useId();
  const complete = useCompleteSetup();
  // Read once: it only fills the form's first values.
  const [old] = useState(oldBrowserProfile);
  const form = useForm<SetupFormValues>({
    resolver: zodResolver(setupFormSchema),
    defaultValues: {
      name: old?.name === undefined || old.name === '' ? (serverName ?? '') : old.name,
      bio: old?.bio ?? '',
      picture: old?.picture ?? null,
      password: '',
      confirm: '',
    },
  });
  const { errors } = form.formState;
  const picture = useWatch({ control: form.control, name: 'picture' });
  const name = useWatch({ control: form.control, name: 'name' });

  return (
    <>
      <span className="flex items-center gap-2">
        <BrandMark />
        <span className="text-title font-medium">Orynx</span>
      </span>
      <div className="flex flex-col gap-1">
        <h1 id={titleId} className="m-0 text-title-lg font-medium">
          Set up Orynx
        </h1>
        <p className="m-0 text-muted-foreground">
          Tell Orynx who you are and choose a password. Your phone and other computers on your wifi ask for it at
          orynx.local.
        </p>
      </div>
      <form
        noValidate
        aria-labelledby={titleId}
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          void form.handleSubmit((values) => {
            const profile = { name: values.name, bio: values.bio, picture: values.picture };
            complete.mutate({ profile, password: values.password }, { onSuccess: forgetOldBrowserProfile });
          })(event);
        }}
      >
        <PicturePicker
          picture={picture}
          initials={personName(name).initials}
          error={errors.picture?.message}
          onChange={(next) => {
            form.setValue('picture', next, { shouldDirty: true });
            form.clearErrors('picture');
          }}
          onError={(message) => {
            form.setError('picture', { message });
          }}
        />
        <Field label="Name" error={errors.name?.message}>
          <Input autoComplete="name" {...form.register('name')} />
        </Field>
        <Field label="Bio" error={errors.bio?.message}>
          <Textarea rows={3} {...form.register('bio')} />
        </Field>
        <Field label="Password" help="At least 8 characters." error={errors.password?.message}>
          <Input type="password" autoComplete="new-password" {...form.register('password')} />
        </Field>
        <Field label="Confirm password" error={errors.confirm?.message}>
          <Input type="password" autoComplete="new-password" {...form.register('confirm')} />
        </Field>
        {complete.error === null || complete.error.code === 'already_set_up' ? null : (
          <p role="alert" className="m-0 text-small text-danger">
            {complete.error.message}
          </p>
        )}
        <Button type="submit" variant="primary" pending={complete.isPending} className="self-start">
          Finish setup
        </Button>
      </form>
    </>
  );
}
