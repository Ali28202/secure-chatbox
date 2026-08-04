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
