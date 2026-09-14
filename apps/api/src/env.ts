import * as z from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),

    DATABASE_URL: z.url({ error: 'must be a valid postgresql:// connection URL' }),

    JWT_ACCESS_SECRET: z.string().min(32, { error: 'must be at least 32 characters' }),
    JWT_REFRESH_SECRET: z.string().min(32, { error: 'must be at least 32 characters' }),

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

    COOKIE_SECURE: z.stringbool().default(false),

    S3_BUCKET: z.string().min(1, { error: 'is required — the bucket attachments are stored in' }),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_ACCESS_KEY_ID: z.string().min(1, { error: 'is required' }),
    S3_SECRET_ACCESS_KEY: z.string().min(1, { error: 'is required' }),

    S3_ENDPOINT: z
      .union([z.url({ error: 'must be a valid http(s):// URL' }), z.literal('')])
      .default(''),

    S3_URL_TTL: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 5),

    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean)
      ),

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
  console.error('\n  فایل .env ریشهٔ پروژه رو با .env.example مقایسه کن.\n');
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
