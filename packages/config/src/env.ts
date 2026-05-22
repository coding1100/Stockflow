import { z } from 'zod';

/**
 * Centralised environment schema. Parsed once at process boot so every app/worker
 * fails fast (with a readable error) on a missing or malformed variable rather than
 * blowing up deep in a request. Import `env` anywhere a config value is needed.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(16, 'NEXTAUTH_SECRET must be at least 16 chars'),
  NEXTAUTH_URL: z.string().url().default('http://localhost:3000'),
  SENTRY_DSN: z.string().optional(),
  SEED_SCENARIO: z.enum(['demo-default', 'peak', 'clean']).default('demo-default'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const env: Env = loadEnv();
