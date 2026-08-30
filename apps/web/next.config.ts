import type { NextConfig } from 'next';
import path from 'path';

const workspaceRoot = path.resolve(process.cwd(), '../../');

const nextConfig = {
  output: 'standalone',

  outputFileTracingRoot: workspaceRoot,

  turbopack: {
    root: workspaceRoot,
  },

  transpilePackages: ['@repo/shared'],
} as NextConfig;

export default nextConfig;
