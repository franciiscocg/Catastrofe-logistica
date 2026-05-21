import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from '../../../backend/node_modules/fastify/fastify.js'
import jwt from '../../../backend/node_modules/@fastify/jwt/jwt.js'
import { errorHandler } from '../../../backend/src/middleware/error.middleware.js'

const { confirmarQrInventarioMock, getEstadoSolicitudQrMock } = vi.hoisted(() => ({
  confirmarQrInventarioMock: vi.fn(),
  getEstadoSolicitudQrMock: vi.fn(),
}))

vi.mock('../../../backend/src/modules/inventario/inventario.service.js', async () => {
  const actual = await vi.importActual<typeof import('../../../backend/src/modules/inventario/inventario.service.js')>(
    '../../../backend/src/modules/inventario/inventario.service.js',
  )
  return {
    ...actual,
    confirmarQrInventario: confirmarQrInventarioMock,
    getEstadoSolicitudQr: getEstadoSolicitudQrMock,
  }
})

import { inventarioRouter } from '../../../backend/src/modules/inventario/inventario.router.js'

async function buildTestApp() {
  const app = Fastify({ logger: false })
  await app.register(jwt, { secret: 'test-secret' })
  app.setErrorHandler(errorHandler)
  await app.register(inventarioRouter, { prefix: '/api/inventario' })
  return app
}

describe('inventarioRouter confirmar QR', () => {
  beforeEach(() => vi.resetAllMocks())

  it('confirma un QR autenticado y pasa puesto, codigo y usuario al servicio', async () => {
    const app = await buildTestApp()
    const token = app.jwt.sign({ id: 'user-1' })
    confirmarQrInventarioMock.mockResolvedValue({
      tipo: 'SOLICITUD_CIUDADANO',
      productos: [],
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/inventario/puesto/puesto-1/confirmar-qr',
      headers: { authorization: `Bearer ${token}` },
      payload: { codigo: '{"t":"SC","p":"puesto-1","i":[]}' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ tipo: 'SOLICITUD_CIUDADANO', productos: [] })
    expect(confirmarQrInventarioMock).toHaveBeenCalledWith(
      'puesto-1',
      { codigo: '{"t":"SC","p":"puesto-1","i":[]}' },
      'user-1',
    )
    await app.close()
  })

  it('rechaza confirmacion QR sin autenticacion', async () => {
    const app = await buildTestApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/inventario/puesto/puesto-1/confirmar-qr',
      payload: { codigo: '{"t":"SC"}' },
    })

    expect(response.statusCode).toBe(401)
    expect(confirmarQrInventarioMock).not.toHaveBeenCalled()
    await app.close()
  })

  it('devuelve el mensaje del servicio y no un Bad Request generico', async () => {
    const app = await buildTestApp()
    const token = app.jwt.sign({ id: 'user-1' })
    confirmarQrInventarioMock.mockRejectedValue(
      Object.assign(new Error('Stock insuficiente de Agua. Disponible: 2 litros'), { statusCode: 400 }),
    )

    const response = await app.inject({
      method: 'POST',
      url: '/api/inventario/puesto/puesto-1/confirmar-qr',
      headers: { authorization: `Bearer ${token}` },
      payload: { codigo: '{"t":"SC","p":"puesto-1","i":[]}' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      error: 'Stock insuficiente de Agua. Disponible: 2 litros',
    })
    await app.close()
  })

  it('devuelve detalles claros si falta el codigo del QR', async () => {
    const app = await buildTestApp()
    const token = app.jwt.sign({ id: 'user-1' })

    const response = await app.inject({
      method: 'POST',
      url: '/api/inventario/puesto/puesto-1/confirmar-qr',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      error: 'Datos inválidos',
      details: [expect.objectContaining({ field: 'codigo' })],
    })
    expect(confirmarQrInventarioMock).not.toHaveBeenCalled()
    await app.close()
  })

  it('consulta el estado de una solicitud ciudadana autenticada', async () => {
    const app = await buildTestApp()
    const token = app.jwt.sign({ id: 'user-1' })
    getEstadoSolicitudQrMock.mockResolvedValue({
      estado: 'COMPLETADA',
      completedAt: '2026-05-18T10:00:00.000Z',
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/inventario/qr-solicitudes/sol-1',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      estado: 'COMPLETADA',
      completedAt: '2026-05-18T10:00:00.000Z',
    })
    expect(getEstadoSolicitudQrMock).toHaveBeenCalledWith('sol-1')
    await app.close()
  })
})
