const DEV_JWT_SECRET = 'dev-secret-change-in-prod'

function envFlag(name: string, fallback: boolean) {
  const value = process.env[name]
  if (value === undefined) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (process.env.NODE_ENV === 'production' && (!secret || secret === DEV_JWT_SECRET || secret.length < 32)) {
    throw new Error('JWT_SECRET seguro obligatorio en produccion')
  }
  return secret ?? DEV_JWT_SECRET
}

export const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '15m'
export const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.JWT_EXPIRES_SECONDS ?? 15 * 60)
export const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 14)
export const RESET_TOKEN_TTL_MINUTES = Number(process.env.RESET_TOKEN_TTL_MINUTES ?? 30)
export const VERIFY_TOKEN_TTL_HOURS = Number(process.env.VERIFY_TOKEN_TTL_HOURS ?? 24)
export const EMAIL_VERIFICATION_REQUIRED = envFlag('EMAIL_VERIFICATION_REQUIRED', process.env.NODE_ENV === 'production')
