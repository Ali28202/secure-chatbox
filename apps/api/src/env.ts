import * as z from 'zod';

/**
 * Every environment variable the API reads, parsed once at boot.
 *
 * The point of doing this here rather than sprinkling `process.env.X` through
 * the codebase is failure timing. A missing `JWT_ACCESS_SECRET` reached lazily
 * shows up as tokens that silently fail to verify hours later; reached here it
 * stops the process with the variable's name in the message.
 *
 * Messages in this file stay English on purpose — the audience is whoever is
 * running the server, and the variable names are English anyway. User-facing
 * validation is Persian and lives in `@repo/shared`.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),

    DATABASE_URL: z.url({ error: 'must be a valid postgresql:// connection URL' }),

    JWT_ACCESS_SECRET: z.string().min(32, { error: 'must be at least 32 characters' }),
    JWT_REFRESH_SECRET: z.string().min(32, { error: 'must be at least 32 characters' }),

    /** Seconds. Short by design — the refresh token is what provides longevity. */
    ACCESS_TOKEN_TTL: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 15),
    REFRESH_TOKEN_TTL: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 60 * 24 * 7),

    /**
     * Explicit rather than inferred from NODE_ENV: this platform is deployed on
     * a campus intranet that may well be served over plain HTTP, and a `Secure`
     * cookie there is one the browser silently refuses to send.
     */
    COOKIE_SECURE: z.stringbool().default(false),

    /**
     * Where message attachments are written.
     *
     * Resolved against the API's working directory, so the default lands in
     * `apps/api/storage/uploads` and needs no configuration to work. In
     * production it is an absolute path onto a mounted volume — uploads must
     * outlive the container, and a default that quietly stores a semester of
     * coursework inside an image layer would not tell anyone it had.
     */
    UPLOAD_DIR: z.string().min(1).default('storage/uploads'),

    /** Comma-separated. Empty in production, where nginx makes it one origin. */
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean)
      ),

    /**
     * Who may reach the API at all, as comma-separated CIDR blocks or single
     * addresses. Empty disables the check entirely.
     *
     * The default is the campus LAN plus loopback — the whole premise of this
     * platform is that academic conversations never leave the university
     * network. nginx (M12) is the primary gate; this is what keeps `:3001` from
     * being an open door for anyone who reaches the host directly, whether by
     * a published port, a misconfigured firewall, or another container.
     *
     * Left settable rather than hardcoded because a deployment on a different
     * subnet is an ordinary thing, and someone editing a source file to make
     * the server start is not.
     */
    ALLOWED_IP_RANGES: z
      .string()
      .default('192.168.0.0/16,127.0.0.1,::1')
      .transform((value) =>
        value
          .split(',')
          .map((range) => range.trim())
          .filter(Boolean)
      ),
  })
  .refine((value) => value.JWT_ACCESS_SECRET !== value.JWT_REFRESH_SECRET, {
    error:
      'must differ from JWT_ACCESS_SECRET, or a refresh token can be replayed as an access token',
    path: ['JWT_REFRESH_SECRET'],
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('\n✖ پیکربندی محیط نامعتبر است — سرور اجرا نشد.');
  console.error('  Invalid environment configuration. The server did not start.\n');
  for (const issue of parsed.error.issues) {
    const name = issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)';
    console.error(`  • ${name}: ${issue.message}`);
  }
  console.error('\n  فایل .env در ریشهٔ پروژه را با .env.example مقایسه کنید.\n');
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
