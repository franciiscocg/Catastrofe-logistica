import { env } from '../config/env.js'

export function getJwtSecret() {
  return env.JWT_SECRET
}

export const ACCESS_TOKEN_EXPIRES_IN = env.JWT_EXPIRES_IN
export const ACCESS_TOKEN_TTL_SECONDS = env.JWT_EXPIRES_SECONDS
export const REFRESH_TOKEN_TTL_DAYS = env.REFRESH_TOKEN_TTL_DAYS
