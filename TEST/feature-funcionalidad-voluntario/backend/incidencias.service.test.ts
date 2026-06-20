// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../backend/src/lib/prisma.js', () => ({
  prisma: {
    voluntario: { findUnique: vi.fn() },
    donacion: { findFirst: vi.fn() },
    incidenciaVia: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    catastrofe: { findUnique: vi.fn(), findMany: vi.fn() },
    asignacionIncidencia: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    asignacionPuesto: { findFirst: vi.fn() },
    comentarioIncidenciaVia: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { prisma } from '../../../backend/src/lib/prisma.js'
import {
  createAsignacionIncidencia,
  finalizarAsignacionIncidencia,
  createComentarioIncidencia,
  getAsignacionIncidenciaActiva,
  listAsignacionesIncidencia,
} from '../../../backend/src/modules/incidencias/incidencias.service.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USUARIO_ID    = 'usuario-1'
const VOLUNTARIO_ID = 'voluntario-1'
const INCIDENCIA_ID = 'incidencia-1'
const ASIGNACION_ID = 'asignacion-1'

const incidenciaCortada = {
  id: INCIDENCIA_ID, catastrofeId: 'cat-1',
  latitud: 39.47, longitud: -0.37, estado: 'CORTADA',
  descripcion: 'Calle cortada por inundacion', createdAt: new Date(),
}

const asignacionActiva = {
  id: ASIGNACION_ID, voluntarioId: VOLUNTARIO_ID, incidenciaId: INCIDENCIA_ID,
  estado: 'ACTIVA', startedAt: new Date(), incidencia: incidenciaCortada,
}

// ── createAsignacionIncidencia ────────────────────────────────────────────────

describe('createAsignacionIncidencia', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Configurar $transaction para que ejecute el callback con el mock de prisma
    mp.$transaction.mockImplementation(async (fn: (tx: typeof mp) => Promise<unknown>) => fn(mp))
  })

  it('asigna al voluntario en una incidencia CORTADA exitosamente', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.donacion.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)
    mp.asignacionIncidencia.findFirst.mockResolvedValue(null)
    mp.incidenciaVia.findFirst.mockResolvedValue({ id: INCIDENCIA_ID })
    mp.asignacionIncidencia.create.mockResolvedValue(asignacionActiva)

    const result = await createAsignacionIncidencia(USUARIO_ID, INCIDENCIA_ID)

    expect(result.id).toBe(ASIGNACION_ID)
    expect(result.estado).toBe('ACTIVA')
    expect(mp.asignacionIncidencia.create).toHaveBeenCalledOnce()
  })

  it('solo acepta incidencias CORTADAS — lanza 404 si ya está transitable', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.donacion.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)
    mp.asignacionIncidencia.findFirst.mockResolvedValue(null)
    mp.incidenciaVia.findFirst.mockResolvedValue(null) // findFirst con estado:CORTADA -> null

    await expect(createAsignacionIncidencia(USUARIO_ID, INCIDENCIA_ID)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Incidencia no encontrada o ya transitable',
    })
    expect(mp.asignacionIncidencia.create).not.toHaveBeenCalled()
  })

  it('lanza 400 si el voluntario tiene una donación activa en curso', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.donacion.findFirst.mockResolvedValue({ id: 'don-activa' })

    await expect(createAsignacionIncidencia(USUARIO_ID, INCIDENCIA_ID)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('donación activa'),
    })
    expect(mp.asignacionIncidencia.create).not.toHaveBeenCalled()
  })

  it('lanza 400 si el voluntario ya está ayudando en un puesto activo', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.donacion.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.findFirst.mockResolvedValue({
      id: 'asig-puesto-1', estado: 'ACTIVA',
      puesto: { nombre: 'Puesto Valencia Norte' },
    })

    await expect(createAsignacionIncidencia(USUARIO_ID, INCIDENCIA_ID)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('Puesto Valencia Norte'),
    })
  })

  it('es idempotente si el voluntario ya está asignado a la misma incidencia', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.donacion.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)
    mp.asignacionIncidencia.findFirst.mockResolvedValue(asignacionActiva)

    const result = await createAsignacionIncidencia(USUARIO_ID, INCIDENCIA_ID)

    expect(result.id).toBe(ASIGNACION_ID)
    expect(mp.asignacionIncidencia.create).not.toHaveBeenCalled()
  })

  it('lanza 400 si el voluntario ya está en otra incidencia diferente', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.donacion.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)
    mp.asignacionIncidencia.findFirst.mockResolvedValue({
      ...asignacionActiva,
      incidenciaId: 'incidencia-otra',
      incidencia: { ...incidenciaCortada, id: 'incidencia-otra' },
    })

    await expect(createAsignacionIncidencia(USUARIO_ID, INCIDENCIA_ID)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('otra incidencia'),
    })
  })

  it('lanza 400 si el usuario no tiene perfil de voluntario', async () => {
    mp.voluntario.findUnique.mockResolvedValue(null)

    await expect(createAsignacionIncidencia(USUARIO_ID, INCIDENCIA_ID)).rejects.toMatchObject({
      statusCode: 400,
      message: 'El usuario no tiene perfil de voluntario',
    })
  })
})

// ── finalizarAsignacionIncidencia ─────────────────────────────────────────────

describe('finalizarAsignacionIncidencia', () => {
  beforeEach(() => vi.clearAllMocks())

  it('finaliza la asignación activa y registra la hora de fin', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.asignacionIncidencia.findFirst.mockResolvedValue({ id: ASIGNACION_ID })
    mp.asignacionIncidencia.update.mockResolvedValue({
      ...asignacionActiva, estado: 'FINALIZADA', endedAt: new Date(),
    })

    const result = await finalizarAsignacionIncidencia(USUARIO_ID, INCIDENCIA_ID)

    expect(result.estado).toBe('FINALIZADA')
    expect(mp.asignacionIncidencia.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ASIGNACION_ID },
        data: expect.objectContaining({ estado: 'FINALIZADA' }),
      }),
    )
  })

  it('lanza 404 si no hay asignación activa para esa incidencia', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.asignacionIncidencia.findFirst.mockResolvedValue(null)

    await expect(finalizarAsignacionIncidencia(USUARIO_ID, INCIDENCIA_ID)).rejects.toMatchObject({
      statusCode: 404,
      message: 'No tienes una asignación activa en esta incidencia',
    })
    expect(mp.asignacionIncidencia.update).not.toHaveBeenCalled()
  })
})

// ── createComentarioIncidencia ────────────────────────────────────────────────
// Al terminar ayuda en incidencia se exige actualizar el estado real de la calle

describe('createComentarioIncidencia', () => {
  beforeEach(() => vi.clearAllMocks())

  it('crea comentario y actualiza el estado de la incidencia atomicamente', async () => {
    mp.incidenciaVia.findUnique.mockResolvedValue({ id: INCIDENCIA_ID })
    const comentarioCreado = { id: 'com-1', incidenciaId: INCIDENCIA_ID, estado: 'TRANSITABLE', comentario: 'La calle ya es transitable', autor: null }
    const incidenciaActualizada = { id: INCIDENCIA_ID, estado: 'TRANSITABLE' }

    const asignacionUpdateMany = vi.fn().mockResolvedValue({ count: 1 })
    mp.$transaction.mockImplementation(async (fn: (tx: typeof mp) => Promise<unknown>) => {
      const tx = {
        comentarioIncidenciaVia: { create: vi.fn().mockResolvedValue(comentarioCreado) },
        incidenciaVia: { update: vi.fn().mockResolvedValue(incidenciaActualizada) },
        // Al pasar a TRANSITABLE el servicio finaliza las asignaciones activas.
        asignacionIncidencia: { updateMany: asignacionUpdateMany },
      }
      return fn(tx)
    })

    const result = await createComentarioIncidencia(INCIDENCIA_ID, {
      estado: 'TRANSITABLE',
      comentario: 'La calle ya es transitable',
    })

    expect(result.comentario.estado).toBe('TRANSITABLE')
    expect(result.incidencia.estado).toBe('TRANSITABLE')
    // La calle vuelve a ser transitable -> las asignaciones activas se finalizan.
    expect(asignacionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { incidenciaId: INCIDENCIA_ID, estado: 'ACTIVA' },
        data: expect.objectContaining({ estado: 'FINALIZADA' }),
      }),
    )
  })

  it('puede reportar que la calle sigue CORTADA con comentario obligatorio', async () => {
    mp.incidenciaVia.findUnique.mockResolvedValue({ id: INCIDENCIA_ID })
    const comentario = { id: 'com-2', incidenciaId: INCIDENCIA_ID, estado: 'CORTADA', comentario: 'Sigue cortada, hay escombros', autor: null }
    mp.$transaction.mockImplementation(async (fn: (tx: typeof mp) => Promise<unknown>) => {
      const tx = {
        comentarioIncidenciaVia: { create: vi.fn().mockResolvedValue(comentario) },
        incidenciaVia: { update: vi.fn().mockResolvedValue({ id: INCIDENCIA_ID, estado: 'CORTADA' }) },
      }
      return fn(tx)
    })

    const result = await createComentarioIncidencia(INCIDENCIA_ID, {
      estado: 'CORTADA',
      comentario: 'Sigue cortada, hay escombros',
    })

    expect(result.incidencia.estado).toBe('CORTADA')
    expect(result.comentario.comentario).toBe('Sigue cortada, hay escombros')
  })

  it('lanza 404 si la incidencia no existe', async () => {
    mp.incidenciaVia.findUnique.mockResolvedValue(null)

    await expect(
      createComentarioIncidencia('inc-inexistente', { estado: 'TRANSITABLE', comentario: 'ok' }),
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(mp.$transaction).not.toHaveBeenCalled()
  })
})

// ── getAsignacionIncidenciaActiva ─────────────────────────────────────────────

describe('getAsignacionIncidenciaActiva', () => {
  beforeEach(() => vi.clearAllMocks())

  it('devuelve la mision activa del voluntario con los datos de la incidencia', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.asignacionIncidencia.findFirst.mockResolvedValue(asignacionActiva)

    const result = await getAsignacionIncidenciaActiva(USUARIO_ID)

    expect(result?.id).toBe(ASIGNACION_ID)
    expect(result?.incidencia.estado).toBe('CORTADA')
  })

  it('devuelve null si no hay asignación activa', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.asignacionIncidencia.findFirst.mockResolvedValue(null)

    expect(await getAsignacionIncidenciaActiva(USUARIO_ID)).toBeNull()
  })
})

// ── listAsignacionesIncidencia ────────────────────────────────────────────────

describe('listAsignacionesIncidencia', () => {
  beforeEach(() => vi.clearAllMocks())

  it('devuelve el historial de incidencias del voluntario (hasta 20 registros)', async () => {
    mp.voluntario.findUnique.mockResolvedValue({ id: VOLUNTARIO_ID })
    mp.asignacionIncidencia.findMany.mockResolvedValue([
      asignacionActiva,
      { ...asignacionActiva, id: 'asig-2', estado: 'FINALIZADA' },
    ])

    const result = await listAsignacionesIncidencia(USUARIO_ID)

    expect(result).toHaveLength(2)
    expect(mp.asignacionIncidencia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { voluntarioId: VOLUNTARIO_ID },
        take: 20,
      }),
    )
  })
})
