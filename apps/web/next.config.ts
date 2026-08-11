import type { NextConfig } from 'next';
import path from 'path';

const workspaceRoot = path.resolve(process.cwd(), '../../');

const nextConfig = {
  /**
   * Emits `.next/standalone` — a self-contained server plus only the
   * `node_modules` files the build actually traced. It is what `apps/web/Dockerfile`
   * ships: the alternative is `next start`, which needs the full dependency tree
   * installed in the image, and this app's tree includes Next's own toolchain.
   *
   * Paired with `outputFileTracingRoot` below. Tracing defaults to the Next
   * project directory, which in this monorepo would miss `@repo/shared` and
   * everything under the root `node_modules` — so the root is the tracing root,
   * and the emitted tree therefore mirrors the repo: the entrypoint is
   * `standalone/apps/web/server.js`, not `standalone/server.js`.
   */
  output: 'standalone',

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
