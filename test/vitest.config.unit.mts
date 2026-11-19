import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    globals: true,
    include: ['test/unit/**/*.spec.ts'],
    setupFiles: ['test/unit/setup.ts'],
    // Run hooks one after another, as jest did.
    sequence: { hooks: 'list' },
    server: {
      deps: {
        // Load lru-cache through vitest, so vi.resetModules() gives the expiry
        // tests a fresh copy that picks up the fake clock.
        inline: ['lru-cache'],
      },
    },
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['src/*.ts'],
    },
  },
});
