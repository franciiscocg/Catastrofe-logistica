// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { haversineKm, sortByDistance } from '../../../frontend/src/utils/haversine'

// ── haversineKm ───────────────────────────────────────────────────────────────

describe('haversineKm', () => {
  it('devuelve ~0 para el mismo punto', () => {
    expect(haversineKm(39.4254, -0.4178, 39.4254, -0.4178)).toBeCloseTo(0, 5)
  })

  it('calcula ~6km entre Paiporta y el centro de Valencia', () => {
    const dist = haversineKm(39.4254, -0.4178, 39.4697, -0.3773)
    expect(dist).toBeGreaterThan(5)
    expect(dist).toBeLessThan(8)
  })

  it('calcula ~3km entre Paiporta y Catarroja', () => {
    const dist = haversineKm(39.4254, -0.4178, 39.3990, -0.4019)
    expect(dist).toBeGreaterThan(2)
    expect(dist).toBeLessThan(4)
  })

  it('es simetrico — la distancia A→B es igual a B→A', () => {
    const d1 = haversineKm(39.4254, -0.4178, 39.3990, -0.4019)
    const d2 = haversineKm(39.3990, -0.4019, 39.4254, -0.4178)
    expect(d1).toBeCloseTo(d2, 10)
  })

  it('devuelve valores positivos para puntos distintos', () => {
    expect(haversineKm(0, 0, 1, 1)).toBeGreaterThan(0)
  })
})

// ── sortByDistance ─────────────────────────────────────────────────────────────
// Usado para ordenar incidencias por cercania al voluntario y para la ruta multiparada

describe('sortByDistance', () => {
  const incidencias = [
    { id: 'lejos',  latitud: 40.0,    longitud:  0.0,   estado: 'CORTADA' as const },
    { id: 'cerca',  latitud: 39.4254, longitud: -0.4178, estado: 'CORTADA' as const },
    { id: 'medio',  latitud: 39.5,    longitud: -0.35,  estado: 'CORTADA' as const },
  ]
  const voluntarioLat = 39.4254
  const voluntarioLng = -0.4178

  it('ordena de mas cercano a mas lejano respecto al voluntario', () => {
    const sorted = sortByDistance(incidencias, voluntarioLat, voluntarioLng)
    expect(sorted[0].id).toBe('cerca')
    expect(sorted[2].id).toBe('lejos')
  })

  it('añade el campo distanciaKm a cada elemento', () => {
    const sorted = sortByDistance(incidencias, voluntarioLat, voluntarioLng)
    expect(sorted[0].distanciaKm).toBeCloseTo(0, 1)
    expect(sorted[1].distanciaKm).toBeGreaterThan(0)
    expect(sorted[2].distanciaKm).toBeGreaterThan(sorted[1].distanciaKm)
  })

  it('devuelve array vacio si la entrada es vacia', () => {
    expect(sortByDistance([], voluntarioLat, voluntarioLng)).toEqual([])
  })

  it('preserva los campos originales del objeto (id, latitud, longitud, etc.)', () => {
    const sorted = sortByDistance(incidencias, voluntarioLat, voluntarioLng)
    expect(sorted[0]).toHaveProperty('id')
    expect(sorted[0]).toHaveProperty('latitud')
    expect(sorted[0]).toHaveProperty('estado')
  })

  it('ordena correctamente puestos de donación para la ruta multiparada', () => {
    const puestos = [
      { id: 'puesto-norte', nombre: 'Puesto Norte', latitud: 39.50, longitud: -0.37 },
      { id: 'puesto-sur',   nombre: 'Puesto Sur',   latitud: 39.40, longitud: -0.42 },
      { id: 'puesto-este',  nombre: 'Puesto Este',  latitud: 39.47, longitud: -0.30 },
    ]
    const volLat = 39.43
    const volLng = -0.41

    const sorted = sortByDistance(puestos, volLat, volLng)

    // Puesto Sur es el mas cercano al voluntario en esta posicion
    expect(sorted[0].id).toBe('puesto-sur')
    // El orden de paradas debe ser: primero el mas cercano
    expect(sorted[0].distanciaKm).toBeLessThan(sorted[1].distanciaKm)
    expect(sorted[1].distanciaKm).toBeLessThan(sorted[2].distanciaKm)
  })
})
