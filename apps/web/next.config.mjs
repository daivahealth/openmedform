import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@openmedform/formio-core': path.resolve(
        __dirname,
        '../../packages/formio-core/dist/formio.full.min.js',
      ),
    };
    return config;
  },
};

export default nextConfig;
