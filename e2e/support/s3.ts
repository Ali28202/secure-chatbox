import { execFileSync } from 'node:child_process';
import { s3ClientConfig } from './env';

function runInBun(body: string): string {
  return execFileSync(
    'bun',
    ['-e', `const client = new Bun.S3Client(${JSON.stringify(s3ClientConfig())});\n${body}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
}

export function objectExists(key: string): boolean {
  return (
    runInBun(`process.stdout.write(String(await client.exists(${JSON.stringify(key)})))`) === 'true'
  );
}
