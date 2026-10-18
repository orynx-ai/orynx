import { onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { createQueryClient } from './devhub-app.tsx';

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('createQueryClient', () => {
  // The hub is on this computer: a dropped Wi-Fi must not pause a sync's refetch or Refresh (AC-17, AC-24).
  it('keeps asking the local server when the browser says it is offline', async () => {
    const client = createQueryClient();
    onlineManager.setOnline(false);

    await expect(client.query({ queryKey: ['inbox'], queryFn: () => Promise.resolve('rows') })).resolves.toBe('rows');
    const refresh = client.getMutationCache().build(client, { mutationFn: () => Promise.resolve('synced') });
    await expect(refresh.execute(undefined)).resolves.toBe('synced');
  });
});
