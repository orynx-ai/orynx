import { z } from 'zod';

/** A 256 px picture as WebP, PNG or JPEG; PNG, the biggest, stays well under this. */
const pictureMaxLength = 512 * 1024;

/** Who uses Orynx, the same on every device (spec 043): Set up Orynx and Edit profile save it. */
export const ProfileSchema = z.object({
  /** Empty: the name the server knows (`git config user.name`) shows instead. */
  name: z.string().trim().max(80),
  bio: z.string().trim().max(160),
  /** A small square picture as a `data:image/…;base64` URL, or null for initials. No other URL reaches an <img>. */
  picture: z
    .string()
    .max(pictureMaxLength)
    .regex(/^data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/)
    .nullable(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const defaultProfile: Profile = { name: '', bio: '', picture: null };

export const passwordMinLength = 8;
export const passwordMaxLength = 128;

/** GET /api/setup, and the answer to POST: whether Orynx has its password yet. Until then the app shows Set up Orynx. */
export const SetupStateSchema = z.object({ done: z.boolean() });
export type SetupState = z.infer<typeof SetupStateSchema>;

/** POST /api/setup: the profile, with a name, and the password other devices on the wifi will ask for. Once only. */
export const SetupRequestSchema = z.object({
  profile: ProfileSchema.extend({ name: z.string().trim().min(1).max(80) }),
  password: z.string().min(passwordMinLength).max(passwordMaxLength),
});
export type SetupRequest = z.infer<typeof SetupRequestSchema>;

/** PUT /api/password: Edit profile's Change password. `current` must match the saved one; 204 once `next` is saved. */
export const ChangePasswordRequestSchema = z.object({
  current: z.string().min(1).max(passwordMaxLength),
  next: z.string().min(passwordMinLength).max(passwordMaxLength),
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
