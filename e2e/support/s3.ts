import { execFileSync } from 'node:child_process';
import { s3ClientConfig } from './env';

/**
 * Asking the bucket questions, from Node.
 *
 * `Bun.S3Client` is a runtime built-in and Playwright runs on Node, so every
 * call here is a one-line Bun program spawned for the answer — the same trick
 * `global-setup` uses for `Bun.password`. Slow, and it does not matter: these
 * run a handful of times in the whole suite, and the alternative is a second S3
 * client implementation that could disagree with the API's about something
 * subtle and be believed.
 */

function runInBun(body: string): string {
  return execFileSync(
    'bun',
    ['-e', `const client = new Bun.S3Client(${JSON.stringify(s3ClientConfig())});\n${body}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
}

/** Whether an object is actually in the bucket, whatever the database says. */
export function objectExists(key: string): boolean {
  return (
    runInBun(`process.stdout.write(String(await client.exists(${JSON.stringify(key)})))`) === 'true'
  );
}
