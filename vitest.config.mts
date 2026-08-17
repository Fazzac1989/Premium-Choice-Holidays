import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// The alias is declared here rather than through vite-tsconfig-paths: one
// mapping is not worth a dependency, and this file is the only place outside
// tsconfig.json that needs to know about it.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
