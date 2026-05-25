// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../backend/src/lib/prisma.js', () => ({
  prisma: {
    catastrofe: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    voluntario: {
      findUnique: vi.fn(),
    },
    donacion: {
      findFirst: vi.fn(),
    },
    asignacionPuesto: {
      findFirst: vi.fn(),
    },
    asignacionIncidencia: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    incidenciaVia: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
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

import { prisma } from '../../../backend/src/lib/prisma.js'
import {
  createIncidencia,
  createAsignacionIncidencia,
  finalizarAsignacionIncidencia,
  getAsignacionIncidenciaActiva,
  listAsignacionesIncidencia,
} from '../../../backend/src/modules/incidencias/incidencias.service.js'
import {
  createIncidenciaSchema,
  categoriaIncidenciaSchema,
} from '../../../backend/src/modules/incidencias/incidencias.schema.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CATASTROFE_VALENCIA = {
  id: 'dana-valencia-2024',
  latitud: 39.4250,
  longitud: -0.4000,
  radio: 30,
}

const PUNTO_PAIPORTA  = { latitud: 39.4254, longitud: -0.4178 }
const VOLUNTARIO_ID   = 'voluntario-1'
const VOL_USER_ID     = 'usuario-voluntario-1'
const INCIDENCIA_ID   = 'inc-1'
const ASIGNACION_ID   = 'asig-1'

const voluntarioBase = { id: VOLUNTARIO_ID }

const incidenciaBase = {
  id: INCIDENCIA_ID,
  catastrofeId: CATASTROFE_VALENCIA.id,
  titulo: 'Calle inundada en cruce principal',
  categoria: 'inundacion',
  ...PUNTO_PAIPORTA,
  estado: 'CORTADA',
  descripcion: 'El cruce está completamente inundado',
}

// ── categoriaIncidenciaSchema ─────────────────────────────────────────────────

describe('categoriaIncidenciaSchema — validacion de categorias predefinidas', () => {
  it('acepta la categoria "inundacion"', () => {
    expect(() => categoriaIncidenciaSchema.parse('inundacion')).not.toThrow()
    expect(categoriaIncidenciaSchema.parse('inundacion')).toBe('inundacion')
  })

  it('acepta la categoria "obstaculos_via"', () => {
    expect(categoriaIncidenciaSchema.parse('obstaculos_via')).toBe('obstaculos_via')
  })

  it('acepta la categoria "limpieza"', () => {
    expect(categoriaIncidenciaSchema.parse('limpieza')).toBe('limpieza')
  })

  it('acepta la categoria "asistencia"', () => {
    expect(categoriaIncidenciaSchema.parse('asistencia')).toBe('asistencia')
  })

  it('rechaza una categoria no definida en el sistema', () => {
    expect(() => categoriaIncidenciaSchema.parse('terremoto')).toThrow()
    expect(() => categoriaIncidenciaSchema.parse('incendio')).toThrow()
    expect(() => categoriaIncidenciaSchema.parse('')).toThrow()
  })
})

// ── createIncidenciaSchema — titulo y categoria ───────────────────────────────

describe('createIncidenciaSchema — campos titulo y categoria (nuevos)', () => {
  const baseValido = { ...PUNTO_PAIPORTA, estado: 'CORTADA' as const }

  it('acepta incidencia sin titulo ni categoria (compatibilidad retroactiva)', () => {
    expect(() => createIncidenciaSchema.parse(baseValido)).not.toThrow()
  })

  it('acepta titulo entre 3 y 120 caracteres', () => {
    expect(() => createIncidenciaSchema.parse({ ...baseValido, titulo: 'Abc' })).not.toThrow()
    expect(() => createIncidenciaSchema.parse({ ...baseValido, titulo: 'A'.repeat(120) })).not.toThrow()
  })

  it('rechaza titulo con menos de 3 caracteres', () => {
    expect(() => createIncidenciaSchema.parse({ ...baseValido, titulo: 'AB' })).toThrow()
    expect(() => createIncidenciaSchema.parse({ ...baseValido, titulo: '' })).toThrow()
  })

  it('rechaza titulo con mas de 120 caracteres', () => {
    expect(() => createIncidenciaSchema.parse({ ...baseValido, titulo: 'A'.repeat(121) })).toThrow()
  })

  it('acepta titulo con espacios en los extremos (se normalizan con trim)', () => {
    const result = createIncidenciaSchema.parse({ ...baseValido, titulo: '  Calle inundada  ' })
    expect(result.titulo).toBe('Calle inundada')
  })

  it('acepta categoria valida junto con titulo', () => {
    const result = createIncidenciaSchema.parse({
      ...baseValido,
      titulo: 'Barricada en avenida',
      categoria: 'obstaculos_via',
    })
    expect(result.titulo).toBe('Barricada en avenida')
    expect(result.categoria).toBe('obstaculos_via')
  })

  it('rechaza categoria que no es de las 4 predefinidas', () => {
    expect(() => createIncidenciaSchema.parse({ ...baseValido, categoria: 'terremoto' })).toThrow()
  })
})

// ── createIncidencia con titulo y categoria ───────────────────────────────────

describe('createIncidencia — persistencia de titulo y categoria', () => {
  beforeEach(() => vi.clearAllMocks())

  it('persiste titulo y categoria cuando se proporcionan', async () => {
    mp.catastrofe.findMany.mockResolvedValue([CATASTROFE_VALENCIA])
    mp.incidenciaVia.findMany.mockResolvedValue([])
    mp.incidenciaVia.create.mockResolvedValue({
      ...incidenciaBase,
      id: 'inc-nueva',
    })

    const result = await createIncidencia({
      ...PUNTO_PAIPORTA,
      estado: 'CORTADA',
      titulo: 'Calle inundada en cruce principal',
      categoria: 'inundacion',
    })

    expect(mp.incidenciaVia.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          titulo: 'Calle inundada en cruce principal',
          categoria: 'inundacion',
        }),
      }),
    )
    expect(result.titulo).toBe('Calle inundada en cruce principal')
    expect(result.categoria).toBe('inundacion')
  })

  it('crea incidencia sin titulo ni categoria (campos opcionales)', async () => {
    mp.catastrofe.findMany.mockResolvedValue([CATASTROFE_VALENCIA])
    mp.incidenciaVia.findMany.mockResolvedValue([])
    mp.incidenciaVia.create.mockResolvedValue({
      id: 'inc-sin-categoria',
      catastrofeId: CATASTROFE_VALENCIA.id,
      ...PUNTO_PAIPORTA,
      estado: 'CORTADA',
      titulo: undefined,
      categoria: undefined,
      descripcion: 'Calle cortada',
    })

    const result = await createIncidencia({ ...PUNTO_PAIPORTA, estado: 'CORTADA', descripcion: 'Calle cortada' })

    expect(mp.incidenciaVia.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ titulo: undefined, categoria: undefined }),
      }),
    )
    expect(result.estado).toBe('CORTADA')
  })

  it('persiste las cuatro categorias disponibles correctamente', async () => {
    const categorias = ['inundacion', 'obstaculos_via', 'limpieza', 'asistencia'] as const
    for (const categoria of categorias) {
      vi.clearAllMocks()
      mp.catastrofe.findMany.mockResolvedValue([CATASTROFE_VALENCIA])
      mp.incidenciaVia.findMany.mockResolvedValue([])
      mp.incidenciaVia.create.mockResolvedValue({ id: `inc-${categoria}`, ...PUNTO_PAIPORTA, estado: 'CORTADA', categoria })

      await createIncidencia({ ...PUNTO_PAIPORTA, estado: 'CORTADA', categoria })

      expect(mp.incidenciaVia.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ categoria }) }),
      )
    }
  })

  it('la deteccion de duplicados busca incidencias incluyendo titulo y categoria', async () => {
    mp.catastrofe.findMany.mockResolvedValue([CATASTROFE_VALENCIA])
    mp.incidenciaVia.findMany.mockResolvedValue([
      {
        id: 'inc-existente',
        titulo: 'Inundacion previa',
        categoria: 'inundacion',
        latitud: PUNTO_PAIPORTA.latitud,
        longitud: PUNTO_PAIPORTA.longitud + 0.0001,
        estado: 'CORTADA',
        descripcion: null,
        createdAt: new Date(),
      },
    ])

    await expect(
      createIncidencia({ ...PUNTO_PAIPORTA, estado: 'CORTADA', titulo: 'Nueva inundacion', categoria: 'inundacion' }),
    ).rejects.toMatchObject({ statusCode: 409 })

    expect(mp.incidenciaVia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ titulo: true, categoria: true }),
      }),
    )
  })

  it('con force=true omite la comprobacion de duplicados aunque haya titulo y categoria', async () => {
    mp.catastrofe.findMany.mockResolvedValue([CATASTROFE_VALENCIA])
    mp.incidenciaVia.create.mockResolvedValue({ id: 'inc-forzada', ...incidenciaBase })

    await createIncidencia({
      ...PUNTO_PAIPORTA,
      estado: 'CORTADA',
      titulo: 'Urgente: inundacion grave',
      categoria: 'inundacion',
      force: true,
    })

    expect(mp.incidenciaVia.findMany).not.toHaveBeenCalled()
    expect(mp.incidenciaVia.create).toHaveBeenCalledOnce()
  })
})

// ── createAsignacionIncidencia ────────────────────────────────────────────────

describe('createAsignacionIncidencia — asignacion de voluntario a incidencia', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mp.$transaction.mockImplementation(async (fn: (tx: typeof mp) => Promise<unknown>) => fn(mp))
  })

  it('asigna al voluntario a la incidencia correctamente', async () => {
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.donacion.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)
    mp.asignacionIncidencia.findFirst.mockResolvedValue(null)
    mp.incidenciaVia.findFirst.mockResolvedValue({ id: INCIDENCIA_ID })
    mp.asignacionIncidencia.create.mockResolvedValue({
      id: ASIGNACION_ID,
      voluntarioId: VOLUNTARIO_ID,
      incidenciaId: INCIDENCIA_ID,
      estado: 'ACTIVA',
      startedAt: new Date(),
      incidencia: incidenciaBase,
    })

    const result = await createAsignacionIncidencia(VOL_USER_ID, INCIDENCIA_ID)

    expect(result).toMatchObject({ id: ASIGNACION_ID, incidenciaId: INCIDENCIA_ID })
    expect(mp.asignacionIncidencia.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ voluntarioId: VOLUNTARIO_ID, incidenciaId: INCIDENCIA_ID }),
      }),
    )
  })

  it('es idempotente: devuelve la asignacion activa si el voluntario ya esta en la misma incidencia', async () => {
    const asignacionExistente = {
      id: ASIGNACION_ID,
      voluntarioId: VOLUNTARIO_ID,
      incidenciaId: INCIDENCIA_ID,
      estado: 'ACTIVA',
      incidencia: incidenciaBase,
    }
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.donacion.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)
    mp.asignacionIncidencia.findFirst.mockResolvedValue(asignacionExistente)

    const result = await createAsignacionIncidencia(VOL_USER_ID, INCIDENCIA_ID)

    expect(result.id).toBe(ASIGNACION_ID)
    expect(mp.asignacionIncidencia.create).not.toHaveBeenCalled()
  })

  it('lanza 400 si el voluntario tiene una donacion activa', async () => {
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.donacion.findFirst.mockResolvedValue({ id: 'don-activa' })

    await expect(
      createAsignacionIncidencia(VOL_USER_ID, INCIDENCIA_ID),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('donacion activa'),
    })

    expect(mp.asignacionIncidencia.create).not.toHaveBeenCalled()
  })

  it('lanza 400 si el voluntario ya esta ayudando en un puesto activo', async () => {
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.donacion.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.findFirst.mockResolvedValue({
      id: 'asig-puesto-1',
      voluntarioId: VOLUNTARIO_ID,
      puestoId: 'puesto-1',
      estado: 'ACTIVA',
      puesto: { nombre: 'Puesto Norte' },
    })

    await expect(
      createAsignacionIncidencia(VOL_USER_ID, INCIDENCIA_ID),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('Puesto Norte'),
    })

    expect(mp.asignacionIncidencia.create).not.toHaveBeenCalled()
  })

  it('lanza 400 si el voluntario ya esta asignado a otra incidencia', async () => {
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.donacion.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)
    mp.asignacionIncidencia.findFirst.mockResolvedValue({
      id: 'asig-otra',
      voluntarioId: VOLUNTARIO_ID,
      incidenciaId: 'inc-otra',
      estado: 'ACTIVA',
      incidencia: { id: 'inc-otra', titulo: 'Otra incidencia' },
    })

    await expect(
      createAsignacionIncidencia(VOL_USER_ID, INCIDENCIA_ID),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('Ya estas ayudando en otra incidencia'),
    })
  })

  it('lanza 404 si la incidencia no existe o ya es TRANSITABLE', async () => {
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.donacion.findFirst.mockResolvedValue(null)
    mp.asignacionPuesto.findFirst.mockResolvedValue(null)
    mp.asignacionIncidencia.findFirst.mockResolvedValue(null)
    mp.incidenciaVia.findFirst.mockResolvedValue(null)

    await expect(
      createAsignacionIncidencia(VOL_USER_ID, 'incidencia-inexistente'),
    ).rejects.toMatchObject({ statusCode: 404 })

    expect(mp.asignacionIncidencia.create).not.toHaveBeenCalled()
  })

  it('lanza 400 si el usuario no tiene perfil de voluntario', async () => {
    mp.voluntario.findUnique.mockResolvedValue(null)

    await expect(
      createAsignacionIncidencia('usuario-sin-perfil', INCIDENCIA_ID),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('perfil de voluntario'),
    })
  })
})

// ── finalizarAsignacionIncidencia ─────────────────────────────────────────────

describe('finalizarAsignacionIncidencia — voluntario termina de atender incidencia', () => {
  beforeEach(() => vi.clearAllMocks())

  it('finaliza la asignacion activa registrando la hora de fin', async () => {
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.asignacionIncidencia.findFirst.mockResolvedValue({ id: ASIGNACION_ID })
    mp.asignacionIncidencia.update.mockResolvedValue({
      id: ASIGNACION_ID,
      voluntarioId: VOLUNTARIO_ID,
      incidenciaId: INCIDENCIA_ID,
      estado: 'FINALIZADA',
      endedAt: new Date(),
      incidencia: incidenciaBase,
    })

    const result = await finalizarAsignacionIncidencia(VOL_USER_ID, INCIDENCIA_ID)

    expect(result.estado).toBe('FINALIZADA')
    expect(mp.asignacionIncidencia.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ASIGNACION_ID },
        data: expect.objectContaining({ estado: 'FINALIZADA' }),
      }),
    )
  })

  it('lanza 404 si el voluntario no tiene asignacion activa en esa incidencia', async () => {
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.asignacionIncidencia.findFirst.mockResolvedValue(null)

    await expect(
      finalizarAsignacionIncidencia(VOL_USER_ID, INCIDENCIA_ID),
    ).rejects.toMatchObject({ statusCode: 404 })

    expect(mp.asignacionIncidencia.update).not.toHaveBeenCalled()
  })

  it('lanza 400 si el usuario no tiene perfil de voluntario', async () => {
    mp.voluntario.findUnique.mockResolvedValue(null)

    await expect(
      finalizarAsignacionIncidencia('usuario-sin-perfil', INCIDENCIA_ID),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('perfil de voluntario'),
    })
  })
})

// ── getAsignacionIncidenciaActiva ─────────────────────────────────────────────

describe('getAsignacionIncidenciaActiva — consulta de asignacion activa del voluntario', () => {
  beforeEach(() => vi.clearAllMocks())

  it('devuelve la asignacion activa con datos de la incidencia', async () => {
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.asignacionIncidencia.findFirst.mockResolvedValue({
      id: ASIGNACION_ID,
      voluntarioId: VOLUNTARIO_ID,
      incidenciaId: INCIDENCIA_ID,
      estado: 'ACTIVA',
      startedAt: new Date(),
      incidencia: incidenciaBase,
    })

    const result = await getAsignacionIncidenciaActiva(VOL_USER_ID)

    expect(result).not.toBeNull()
    expect(result!.incidencia.titulo).toBe('Calle inundada en cruce principal')
    expect(result!.incidencia.categoria).toBe('inundacion')
    expect(mp.asignacionIncidencia.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { voluntarioId: VOLUNTARIO_ID, estado: 'ACTIVA' },
      }),
    )
    const select = mp.asignacionIncidencia.findFirst.mock.calls[0][0].include.incidencia.select
    expect(select).not.toHaveProperty('reportanteId')
    expect(select).not.toHaveProperty('reportante')
  })

  it('devuelve null si el voluntario no tiene ninguna asignacion activa', async () => {
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.asignacionIncidencia.findFirst.mockResolvedValue(null)

    const result = await getAsignacionIncidenciaActiva(VOL_USER_ID)

    expect(result).toBeNull()
  })

  it('lanza 400 si el usuario no tiene perfil de voluntario', async () => {
    mp.voluntario.findUnique.mockResolvedValue(null)

    await expect(
      getAsignacionIncidenciaActiva('usuario-sin-perfil'),
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})

// ── listAsignacionesIncidencia ────────────────────────────────────────────────

describe('listAsignacionesIncidencia — historial de incidencias atendidas por el voluntario', () => {
  beforeEach(() => vi.clearAllMocks())

  it('devuelve el historial de asignaciones con datos de incidencia incluyendo categoria', async () => {
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.asignacionIncidencia.findMany.mockResolvedValue([
      {
        id: ASIGNACION_ID,
        voluntarioId: VOLUNTARIO_ID,
        incidenciaId: INCIDENCIA_ID,
        estado: 'FINALIZADA',
        startedAt: new Date('2026-05-11T08:00:00Z'),
        endedAt: new Date('2026-05-11T10:00:00Z'),
        incidencia: { ...incidenciaBase, categoria: 'inundacion' },
      },
      {
        id: 'asig-2',
        voluntarioId: VOLUNTARIO_ID,
        incidenciaId: 'inc-2',
        estado: 'FINALIZADA',
        startedAt: new Date('2026-05-10T14:00:00Z'),
        endedAt: new Date('2026-05-10T16:00:00Z'),
        incidencia: { id: 'inc-2', titulo: 'Obstaculos en calle mayor', categoria: 'obstaculos_via', estado: 'TRANSITABLE' },
      },
    ])

    const result = await listAsignacionesIncidencia(VOL_USER_ID)

    expect(result).toHaveLength(2)
    expect(result[0].incidencia.categoria).toBe('inundacion')
    expect(result[1].incidencia.categoria).toBe('obstaculos_via')
    expect(mp.asignacionIncidencia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { voluntarioId: VOLUNTARIO_ID },
        orderBy: { startedAt: 'desc' },
        take: 20,
      }),
    )
    const select = mp.asignacionIncidencia.findMany.mock.calls[0][0].include.incidencia.select
    expect(select).not.toHaveProperty('reportanteId')
    expect(select).not.toHaveProperty('reportante')
  })

  it('devuelve lista vacia si el voluntario nunca ha atendido incidencias', async () => {
    mp.voluntario.findUnique.mockResolvedValue(voluntarioBase)
    mp.asignacionIncidencia.findMany.mockResolvedValue([])

    const result = await listAsignacionesIncidencia(VOL_USER_ID)

    expect(result).toHaveLength(0)
  })

  it('lanza 400 si el usuario no tiene perfil de voluntario', async () => {
    mp.voluntario.findUnique.mockResolvedValue(null)

    await expect(
      listAsignacionesIncidencia('usuario-sin-perfil'),
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})
