import type { NextConfig } from 'next';
import path from 'path';

const workspaceRoot = path.resolve(process.cwd(), '../../');

const nextConfig = {
  outputFileTracingRoot: workspaceRoot,

  turbopack: {
    root: workspaceRoot,
  },

  // `@repo/shared` is published as raw TypeScript (its `exports` field points
  // straight at `src/index.ts`), so Next has to compile it rather than treat it
  // as a prebuilt dependency.
  transpilePackages: ['@repo/shared'],
} as NextConfig;

export default nextConfig;
