import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // In a pnpm monorepo, standalone output-file tracing must be rooted at the
  // workspace root or Next looks for manifests under the wrong path and the
  // standalone copy step fails (routes-manifest.json ENOENT).
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // Workspace packages shipped as TypeScript source must be transpiled by Next.
  transpilePackages: [
    '@openmedform/react-form-renderer',
    '@openmedform/form-core',
    '@openmedform/form-design-tokens',
    '@openmedform/form-schema-types',
  ],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@openmedform/formio-core': path.resolve(
        __dirname,
        'node_modules/@openmedform/formio-core/lib/cjs/index.js',
      ),
    };
    return config;
  },
};

export default nextConfig;
