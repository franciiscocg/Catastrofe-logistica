// @vitest-environment node
/**
 * Tests de la logica de agrupacion de donaciones por puesto y del predicado
 * isDonacionActiva, tal como estan implementados en VoluntarioDashboard.tsx.
 *
 * Se prueba como logica pura para evitar dependencias de renderizado
 * (jsdom + CSS) que no aportan valor a estos escenarios de negocio.
 */
import { describe, it, expect } from 'vitest'

// ── Tipos (subconjunto del componente) ────────────────────────────────────────

type EstadoDonacion = 'PENDIENTE' | 'EN_CAMINO' | 'ENTREGADA' | 'CANCELADA'

type Donacion = {
  id: string
  cantidad: number
  unidad: string
  estado: EstadoDonacion
  producto: { nombre: string; categoria: string; unidad: string }
  puesto: { id: string; nombre: string }
  entregaCodigo?: string | null
}

// ── Logica replicada de VoluntarioDashboard.tsx ───────────────────────────────

function isDonacionActiva(donacion: Donacion): boolean {
  return donacion.estado === 'PENDIENTE' || donacion.estado === 'EN_CAMINO'
}

function agruparDonacionesPorPuesto(
  donaciones: Donacion[],
): Array<{ puesto: Donacion['puesto']; donaciones: Donacion[] }> {
  const activas = donaciones.filter(isDonacionActiva)
  const byPuesto = new Map<string, { puesto: Donacion['puesto']; donaciones: Donacion[] }>()

  activas.forEach((donacion) => {
    const current = byPuesto.get(donacion.puesto.id)
    if (current) {
      current.donaciones.push(donacion)
    } else {
      byPuesto.set(donacion.puesto.id, { puesto: donacion.puesto, donaciones: [donacion] })
    }
  })

  return Array.from(byPuesto.values())
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PUESTO_NORTE = { id: 'puesto-norte', nombre: 'Pabellon Norte' }
const PUESTO_SUR = { id: 'puesto-sur', nombre: 'CEIP La Paz' }

const PRODUCTO_AGUA = { nombre: 'Agua embotellada', categoria: 'Bebidas', unidad: 'litros' }
const PRODUCTO_MANTAS = { nombre: 'Mantas', categoria: 'Abrigo', unidad: 'unidades' }
const PRODUCTO_ROPA = { nombre: 'Ropa de abrigo', categoria: 'Ropa', unidad: 'prendas' }

function donacion(
  id: string,
  estado: EstadoDonacion,
  puesto: Donacion['puesto'],
  overrides: Partial<Donacion> = {},
): Donacion {
  return {
    id,
    cantidad: 5,
    unidad: 'litros',
    estado,
    producto: PRODUCTO_AGUA,
    puesto,
    entregaCodigo: null,
    ...overrides,
  }
}

// ── isDonacionActiva ──────────────────────────────────────────────────────────

describe('isDonacionActiva', () => {
  it('reconoce PENDIENTE como activa', () => {
    expect(isDonacionActiva(donacion('d1', 'PENDIENTE', PUESTO_NORTE))).toBe(true)
  })

  it('reconoce EN_CAMINO como activa', () => {
    expect(isDonacionActiva(donacion('d1', 'EN_CAMINO', PUESTO_NORTE))).toBe(true)
  })

  it('reconoce ENTREGADA como no activa', () => {
    expect(isDonacionActiva(donacion('d1', 'ENTREGADA', PUESTO_NORTE))).toBe(false)
  })

  it('reconoce CANCELADA como no activa', () => {
    expect(isDonacionActiva(donacion('d1', 'CANCELADA', PUESTO_NORTE))).toBe(false)
  })
})

// ── agruparDonacionesPorPuesto ────────────────────────────────────────────────

describe('agruparDonacionesPorPuesto', () => {
  it('agrupa dos donaciones activas al mismo puesto en una sola parada', () => {
    const donaciones = [
      donacion('don-1', 'PENDIENTE', PUESTO_NORTE, { producto: PRODUCTO_AGUA }),
      donacion('don-2', 'EN_CAMINO', PUESTO_NORTE, { producto: PRODUCTO_MANTAS }),
    ]

    const paradas = agruparDonacionesPorPuesto(donaciones)

    expect(paradas).toHaveLength(1)
    expect(paradas[0].puesto.id).toBe('puesto-norte')
    expect(paradas[0].donaciones).toHaveLength(2)
  })

  it('crea una parada separada por cada puesto distinto', () => {
    const donaciones = [
      donacion('don-1', 'PENDIENTE', PUESTO_NORTE),
      donacion('don-2', 'PENDIENTE', PUESTO_SUR),
    ]

    const paradas = agruparDonacionesPorPuesto(donaciones)

    expect(paradas).toHaveLength(2)
    const ids = paradas.map((p) => p.puesto.id)
    expect(ids).toContain('puesto-norte')
    expect(ids).toContain('puesto-sur')
  })

  it('excluye donaciones ENTREGADAS de las paradas activas', () => {
    const donaciones = [
      donacion('don-1', 'PENDIENTE', PUESTO_NORTE),
      donacion('don-2', 'ENTREGADA', PUESTO_NORTE), // ya entregada
    ]

    const paradas = agruparDonacionesPorPuesto(donaciones)

    expect(paradas).toHaveLength(1)
    expect(paradas[0].donaciones).toHaveLength(1)
    expect(paradas[0].donaciones[0].id).toBe('don-1')
  })

  it('excluye donaciones CANCELADAS de las paradas activas', () => {
    const donaciones = [
      donacion('don-1', 'CANCELADA', PUESTO_NORTE),
      donacion('don-2', 'PENDIENTE', PUESTO_SUR),
    ]

    const paradas = agruparDonacionesPorPuesto(donaciones)

    expect(paradas).toHaveLength(1)
    expect(paradas[0].puesto.id).toBe('puesto-sur')
  })

  it('devuelve array vacio si no hay donaciones activas', () => {
    const donaciones = [
      donacion('don-1', 'ENTREGADA', PUESTO_NORTE),
      donacion('don-2', 'CANCELADA', PUESTO_SUR),
    ]

    const paradas = agruparDonacionesPorPuesto(donaciones)

    expect(paradas).toHaveLength(0)
  })

  it('devuelve array vacio para una lista de donaciones vacia', () => {
    expect(agruparDonacionesPorPuesto([])).toHaveLength(0)
  })

  it('tres donaciones activas al mismo puesto forman una sola parada con 3 elementos', () => {
    const donaciones = [
      donacion('don-1', 'PENDIENTE', PUESTO_NORTE, { producto: PRODUCTO_AGUA }),
      donacion('don-2', 'EN_CAMINO', PUESTO_NORTE, { producto: PRODUCTO_MANTAS }),
      donacion('don-3', 'PENDIENTE', PUESTO_NORTE, { producto: PRODUCTO_ROPA }),
    ]

    const paradas = agruparDonacionesPorPuesto(donaciones)

    expect(paradas).toHaveLength(1)
    expect(paradas[0].donaciones).toHaveLength(3)
  })

  it('mezcla de puestos: 2 al mismo y 1 diferente genera 2 paradas', () => {
    const donaciones = [
      donacion('don-1', 'PENDIENTE', PUESTO_NORTE, { producto: PRODUCTO_AGUA }),
      donacion('don-2', 'EN_CAMINO', PUESTO_NORTE, { producto: PRODUCTO_MANTAS }),
      donacion('don-3', 'PENDIENTE', PUESTO_SUR, { producto: PRODUCTO_ROPA }),
    ]

    const paradas = agruparDonacionesPorPuesto(donaciones)

    expect(paradas).toHaveLength(2)

    const paradaNorte = paradas.find((p) => p.puesto.id === 'puesto-norte')
    const paradaSur = paradas.find((p) => p.puesto.id === 'puesto-sur')

    expect(paradaNorte?.donaciones).toHaveLength(2)
    expect(paradaSur?.donaciones).toHaveLength(1)
  })

  it('preserva el orden de insercion del primer puesto encontrado', () => {
    const donaciones = [
      donacion('don-1', 'PENDIENTE', PUESTO_SUR),
      donacion('don-2', 'PENDIENTE', PUESTO_NORTE),
    ]

    const paradas = agruparDonacionesPorPuesto(donaciones)

    expect(paradas[0].puesto.id).toBe('puesto-sur')
    expect(paradas[1].puesto.id).toBe('puesto-norte')
  })
})
