import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    globals: true,
    include: ['test/functional/index.spec.ts'],
    globalSetup: ['test/functional/global-setup.ts'],
    testTimeout: 10000,
    // Run hooks one after another, as jest did. Shuffle the tests, so a test
    // that only passes after another one fails; rerun a failing order with
    // --sequence.seed=<the seed vitest prints>.
    sequence: { hooks: 'list', shuffle: true },
  },
});
