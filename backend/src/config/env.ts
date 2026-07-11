import 'dotenv/config'
import { z } from 'zod'

const DEV_JWT_SECRET = 'dev-secret-change-in-prod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  JWT_SECRET: z.string().default(DEV_JWT_SECRET),
  JWT_EXPIRES_IN: z.string().min(1).default('15m'),
  JWT_EXPIRES_SECONDS: z.coerce.number().int().positive().default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(14),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).optional(),
}).superRefine((value, context) => {
  if (
    value.NODE_ENV === 'production'
    && (value.JWT_SECRET === DEV_JWT_SECRET || value.JWT_SECRET.length < 32)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_SECRET'],
      message: 'Debe tener al menos 32 caracteres y no usar el valor de desarrollo',
    })
  }
})

export function parseEnv(source: NodeJS.ProcessEnv) {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`Configuración de entorno inválida: ${details}`)
  }
  return result.data
}

export const env = parseEnv(process.env)
