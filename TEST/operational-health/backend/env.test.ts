import { describe, expect, it } from 'vitest'
import { parseEnv } from '../../../backend/src/config/env.js'

describe('configuración de entorno', () => {
  it('aplica valores seguros de desarrollo cuando no se configuran', () => {
    expect(parseEnv({})).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      JWT_EXPIRES_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 14,
    })
  })

  it('rechaza puertos fuera de rango', () => {
    expect(() => parseEnv({ PORT: '70000' })).toThrow('PORT')
  })

  it('exige un secreto robusto en producción', () => {
    expect(() => parseEnv({ NODE_ENV: 'production', JWT_SECRET: 'inseguro' }))
      .toThrow('JWT_SECRET')
  })
})
