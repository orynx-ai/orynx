import { describe, expect, it } from 'vitest';
import { ProfileSchema, SetupRequestSchema } from './index.ts';
import { makeProfile } from './testing.ts';

describe('ProfileSchema (spec 043)', () => {
  it('AC-6: takes a name, a bio and a picture as a data URL', () => {
    const profile = { name: ' Ada ', bio: 'Builds things', picture: 'data:image/webp;base64,UklGRg==' };
    expect(ProfileSchema.parse(profile)).toEqual({ ...profile, name: 'Ada' });
  });

  it('AC-6: refuses a picture that is any other URL, so no other address reaches an image', () => {
    for (const picture of ['https://example.com/a.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=']) {
      expect(ProfileSchema.safeParse({ ...makeProfile(), picture }).success).toBe(false);
    }
  });

  it('AC-6: refuses a name over 80 characters and a bio over 160', () => {
    expect(ProfileSchema.safeParse({ ...makeProfile(), name: 'a'.repeat(81) }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...makeProfile(), bio: 'a'.repeat(161) }).success).toBe(false);
  });
});

describe('SetupRequestSchema (spec 043)', () => {
  it('AC-2: wants a name and a password of 8 to 128 characters', () => {
    const request = { profile: makeProfile({ name: 'Ada' }), password: 'correct horse' };
    expect(SetupRequestSchema.safeParse(request).success).toBe(true);
    expect(SetupRequestSchema.safeParse({ ...request, profile: makeProfile() }).success).toBe(false);
    expect(SetupRequestSchema.safeParse({ ...request, password: 'short' }).success).toBe(false);
    expect(SetupRequestSchema.safeParse({ ...request, password: 'a'.repeat(129) }).success).toBe(false);
  });
});
