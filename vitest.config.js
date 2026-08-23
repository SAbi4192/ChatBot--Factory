import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/*.test.js', 'tests/integration/*.test.js'],
    globalSetup: ['tests/integration/global-setup.js'],
    setupFiles: ['tests/integration/env-setup.js'],
    testTimeout: 30000,
    forceExit: true,
    // Unit tests must NOT touch the test DB — only the integration file.
    pool: 'forks',
  },
});