import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'demo',
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
