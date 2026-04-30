// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock se eleva (hoisting) antes de los imports, por eso los vi.fn()
// deben definirse DENTRO del factory, no en variables externas.
vi.mock('../../../backend/src/lib/prisma.js', () => ({
  prisma: {
    catastrofe: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    incidenciaVia: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    comentarioIncidenciaVia: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

// Importar DESPUÉS del vi.mock para obtener la versión mockeada
import { prisma } from '../../../backend/src/lib/prisma.js'
import {
  createIncidencia,
  listIncidencias,
  updateIncidenciaEstado,
  createComentarioIncidencia,
} from '../../../backend/src/modules/incidencias/incidencias.service.js'

// Helper tipado para acceder a los mocks sin castear en cada test
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CATASTROFE_VALENCIA = {
  id: 'dana-valencia-2024',
  latitud: 39.4250,
  longitud: -0.4000,
  radio: 30,
}

const PUNTO_PAIPORTA = { latitud: 39.4254, longitud: -0.4178 }
const PUNTO_FUERA    = { latitud: 0, longitud: 0 }

// ── createIncidencia ──────────────────────────────────────────────────────────

describe('createIncidencia', () => {
  beforeEach(() => vi.clearAllMocks())

  it('crea incidencia resolviendo automáticamente la catástrofe por ubicación', async () => {
    mp.catastrofe.findMany.mockResolvedValue([CATASTROFE_VALENCIA])
    mp.incidenciaVia.findMany.mockResolvedValue([])
    mp.incidenciaVia.create.mockResolvedValue({
      id: 'inc-1',
      catastrofeId: CATASTROFE_VALENCIA.id,
      ...PUNTO_PAIPORTA,
      estado: 'CORTADA',
      descripcion: 'Calle inundada',
    })

    const result = await createIncidencia({ ...PUNTO_PAIPORTA, estado: 'CORTADA', descripcion: 'Calle inundada' })

    expect(result.estado).toBe('CORTADA')
    expect(result.catastrofeId).toBe(CATASTROFE_VALENCIA.id)
    expect(mp.incidenciaVia.create).toHaveBeenCalledOnce()
  })

  it('usa catastrofeId explícito si se proporciona', async () => {
    mp.catastrofe.findUnique.mockResolvedValue({ id: CATASTROFE_VALENCIA.id })
    mp.incidenciaVia.findMany.mockResolvedValue([])
    mp.incidenciaVia.create.mockResolvedValue({ id: 'inc-2', catastrofeId: CATASTROFE_VALENCIA.id, ...PUNTO_PAIPORTA, estado: 'CORTADA' })

    await createIncidencia({ catastrofeId: CATASTROFE_VALENCIA.id, ...PUNTO_PAIPORTA, estado: 'CORTADA' })

    expect(mp.catastrofe.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: CATASTROFE_VALENCIA.id } }))
    expect(mp.catastrofe.findMany).not.toHaveBeenCalled()
  })

  it('lanza error 400 si no hay catástrofe activa que cubra la ubicación', async () => {
    mp.catastrofe.findMany.mockResolvedValue([])

    await expect(
      createIncidencia({ ...PUNTO_FUERA, estado: 'CORTADA' }),
    ).rejects.toMatchObject({ message: expect.stringContaining('No hay una catástrofe activa'), statusCode: 400 })
  })

  it('lanza error 404 si catastrofeId explícito no existe', async () => {
    mp.catastrofe.findUnique.mockResolvedValue(null)

    await expect(
      createIncidencia({ catastrofeId: 'no-existe', ...PUNTO_PAIPORTA, estado: 'CORTADA' }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('lanza error 409 si hay incidencia similar a menos de 50m en las últimas 2h', async () => {
    mp.catastrofe.findMany.mockResolvedValue([CATASTROFE_VALENCIA])
    mp.incidenciaVia.findMany.mockResolvedValue([{
      id: 'inc-existing',
      latitud: PUNTO_PAIPORTA.latitud,
      longitud: PUNTO_PAIPORTA.longitud + 0.0001, // ~8 metros
      estado: 'CORTADA',
      descripcion: null,
      createdAt: new Date(),
    }])

    await expect(
      createIncidencia({ ...PUNTO_PAIPORTA, estado: 'CORTADA' }),
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('Ya existe una incidencia similar') })
  })

  it('con force=true omite la comprobación de duplicados', async () => {
    mp.catastrofe.findMany.mockResolvedValue([CATASTROFE_VALENCIA])
    mp.incidenciaVia.create.mockResolvedValue({ id: 'inc-forzada', ...PUNTO_PAIPORTA, catastrofeId: CATASTROFE_VALENCIA.id, estado: 'CORTADA' })

    await createIncidencia({ ...PUNTO_PAIPORTA, estado: 'CORTADA', force: true })

    expect(mp.incidenciaVia.findMany).not.toHaveBeenCalled()
    expect(mp.incidenciaVia.create).toHaveBeenCalledOnce()
  })
})

// ── listIncidencias ───────────────────────────────────────────────────────────

describe('listIncidencias', () => {
  beforeEach(() => vi.clearAllMocks())

  it('devuelve todas las incidencias de una catástrofe', async () => {
    const incidencias = [
      { id: '1', estado: 'CORTADA', reportante: null, comentarios: [], _count: { comentarios: 0 } },
      { id: '2', estado: 'TRANSITABLE', reportante: null, comentarios: [], _count: { comentarios: 0 } },
    ]
    mp.incidenciaVia.findMany.mockResolvedValue(incidencias)

    const result = await listIncidencias({ catastrofeId: CATASTROFE_VALENCIA.id })

    expect(result).toHaveLength(2)
    expect(mp.incidenciaVia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { catastrofeId: CATASTROFE_VALENCIA.id } }),
    )
  })

  it('filtra por estado cuando se especifica', async () => {
    mp.incidenciaVia.findMany.mockResolvedValue([])

    await listIncidencias({ catastrofeId: CATASTROFE_VALENCIA.id, estado: 'CORTADA' })

    expect(mp.incidenciaVia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { catastrofeId: CATASTROFE_VALENCIA.id, estado: 'CORTADA' } }),
    )
  })

  it('devuelve lista vacía si no hay incidencias', async () => {
    mp.incidenciaVia.findMany.mockResolvedValue([])
    expect(await listIncidencias({})).toEqual([])
  })
})

// ── updateIncidenciaEstado ────────────────────────────────────────────────────

describe('updateIncidenciaEstado', () => {
  beforeEach(() => vi.clearAllMocks())

  it('actualiza el estado de una incidencia existente', async () => {
    mp.incidenciaVia.findUnique.mockResolvedValue({ id: 'inc-1' })
    mp.incidenciaVia.update.mockResolvedValue({ id: 'inc-1', estado: 'TRANSITABLE' })

    const result = await updateIncidenciaEstado('inc-1', { estado: 'TRANSITABLE' })

    expect(result.estado).toBe('TRANSITABLE')
    expect(mp.incidenciaVia.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'inc-1' }, data: { estado: 'TRANSITABLE' } }),
    )
  })

  it('lanza error 404 para incidencia inexistente', async () => {
    mp.incidenciaVia.findUnique.mockResolvedValue(null)

    await expect(
      updateIncidenciaEstado('no-existe', { estado: 'TRANSITABLE' }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

// ── createComentarioIncidencia ────────────────────────────────────────────────

describe('createComentarioIncidencia', () => {
  beforeEach(() => vi.clearAllMocks())

  it('crea comentario y actualiza estado en una transacción', async () => {
    mp.incidenciaVia.findUnique.mockResolvedValue({ id: 'inc-1' })

    const comentarioCreado = { id: 'com-1', incidenciaId: 'inc-1', estado: 'TRANSITABLE', comentario: 'Calle despejada', autor: null }
    const incidenciaActualizada = { id: 'inc-1', estado: 'TRANSITABLE' }

    mp.$transaction.mockImplementation(async (fn: (tx: typeof mp) => Promise<unknown>) => {
      const tx = {
        comentarioIncidenciaVia: { create: vi.fn().mockResolvedValue(comentarioCreado) },
        incidenciaVia: { update: vi.fn().mockResolvedValue(incidenciaActualizada) },
      }
      return fn(tx)
    })

    const result = await createComentarioIncidencia('inc-1', { estado: 'TRANSITABLE', comentario: 'Calle despejada' })

    expect(result.comentario.estado).toBe('TRANSITABLE')
    expect(result.incidencia.estado).toBe('TRANSITABLE')
  })

  it('lanza error 404 si la incidencia no existe', async () => {
    mp.incidenciaVia.findUnique.mockResolvedValue(null)

    await expect(
      createComentarioIncidencia('no-existe', { estado: 'CORTADA', comentario: 'test' }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})
