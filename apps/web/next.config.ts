import type { NextConfig } from 'next';
import path from 'path';

const workspaceRoot = path.resolve(process.cwd(), '../../');

const nextConfig = {
  outputFileTracingRoot: workspaceRoot,

  turbopack: {
    root: workspaceRoot,
  },
} as NextConfig;

export default nextConfig;
