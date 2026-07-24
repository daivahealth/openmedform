import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

// Point the forked Form.io engine at its CJS build, mirroring the webpack alias
// apps/web uses. formio-core is CommonJS; pre-bundling it lets Vite interop the
// dynamic import used by the Form.io branch.
const formioCore = path.resolve(dir, '../../packages/formio-core/lib/cjs/index.js');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@openmedform/formio-core': formioCore,
    },
  },
  optimizeDeps: {
    include: ['@openmedform/formio-core'],
  },
  server: { port: 5175 },
});
