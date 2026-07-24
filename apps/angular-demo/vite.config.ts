import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dir, '../..');

// Consume the Angular renderer library as SOURCE (not a prebuilt node_modules
// dep) so the Analog plugin compiles its standalone components with ngtsc.
const angularRendererSrc = path.resolve(
  repoRoot,
  'packages/angular-form-renderer/src/index.ts',
);

export default defineConfig({
  plugins: [
    angular({
      // The renderer library is consumed as source (aliased below); tell the
      // Angular compiler to include those files so its standalone components are
      // actually compiled (not emitted empty as out-of-root files would be).
      include: [path.resolve(repoRoot, 'packages/angular-form-renderer/src/**/*.ts')],
    }),
  ],
  resolve: {
    alias: {
      // Renderer library: consumed as source so the Angular compiler (via the
      // plugin `include` below) compiles its standalone components.
      '@openmedform/angular-form-renderer': angularRendererSrc,
      // Plain-TS deps: consume their built ESM so rollup reads named exports
      // without the Angular plugin having to parse their (non-Angular) TS.
      '@openmedform/form-core': path.resolve(repoRoot, 'packages/form-core/dist/index.js'),
      '@openmedform/form-design-tokens': path.resolve(
        repoRoot,
        'packages/form-design-tokens/dist/index.js',
      ),
    },
  },
  optimizeDeps: {
    // Only the Angular renderer library must pass through the Angular compiler
    // (it ships standalone components as source). Plain-TS workspace deps
    // (form-core, form-design-tokens) are fine to esbuild-prebundle.
    exclude: ['@openmedform/angular-form-renderer'],
  },
  server: {
    port: 5176,
    fs: { allow: [repoRoot] },
  },
});
