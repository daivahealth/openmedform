import path from 'node:path';
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
  // The API sets its own headers via helmet; these cover the pages the browser
  // actually renders. No CSP here yet: Next's inline bootstrap and styled-jsx
  // need either nonces or 'unsafe-inline', and shipping the latter would be a
  // CSP in name only. Tracked separately rather than faked.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ];
  },
  transpilePackages: [
    '@openmedform/react-form-renderer',
    '@openmedform/form-core',
    '@openmedform/form-design-tokens',
    '@openmedform/form-print-engine',
    '@openmedform/form-schema-types',
  ],
};

export default nextConfig;
