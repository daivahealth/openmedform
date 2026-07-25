import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: {
      // The Form.io renderer bundles a stack whose build is absent on a clean
      // CI checkout; tests only exercise the routing/JSON Forms paths, so alias
      // it to a lightweight stub. (FormRenderer.test.tsx also vi.mocks it.)
      '@openmedform/renderer': fileURLToPath(new URL('./test/renderer-stub.tsx', import.meta.url)),
    },
  },
});
