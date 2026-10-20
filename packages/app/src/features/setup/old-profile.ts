import { ProfileSchema, type Profile } from '@devhub/contracts';

/** Where Edit profile kept the profile in this browser before spec 043. */
const key = 'devhub.profile';

/** That profile, if this browser has one: it fills the setup form once, so nobody types it again. */
export function oldBrowserProfile(): Profile | null {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    const state = typeof kept === 'object' && kept !== null && 'state' in kept ? kept.state : undefined;
    const parsed = ProfileSchema.safeParse(state);
    return parsed.success ? parsed.data : null;
  } catch {
    // Storage blocked, or not JSON: there is nothing to carry over.
    return null;
  }
}

/** Once the server holds the profile, the browser's copy goes. */
export function forgetOldBrowserProfile(): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing was kept.
  }
}
