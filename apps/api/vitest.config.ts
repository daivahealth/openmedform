import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Only the pure, dependency-free units are covered here. Full
    // service/integration coverage requires a NestJS + Postgres harness (not
    // yet configured — see Phase 5 notes).
    include: ['src/**/*.test.ts'],
  },
});
