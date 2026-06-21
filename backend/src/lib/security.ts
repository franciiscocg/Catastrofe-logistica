const DEV_JWT_SECRET = 'dev-secret-change-in-prod'

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET
  if (process.env.NODE_ENV === 'production' && (!secret || secret === DEV_JWT_SECRET || secret.length < 32)) {
    throw new Error('JWT_SECRET seguro obligatorio en producción')
  }
  return secret ?? DEV_JWT_SECRET
}

export const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '15m'
export const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.JWT_EXPIRES_SECONDS ?? 15 * 60)
export const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 14)
