import { describe, it, expect } from 'vitest'
import { haversineKm, sortByDistance } from '../../../frontend/src/utils/haversine'

describe('haversineKm', () => {
  it('devuelve ~0 para el mismo punto', () => {
    expect(haversineKm(39.4254, -0.4178, 39.4254, -0.4178)).toBeCloseTo(0, 5)
  })

  it('calcula ~6km entre Paiporta y el centro de Valencia', () => {
    // Paiporta: 39.4254, -0.4178 | Valencia centro: 39.4697, -0.3773
    const dist = haversineKm(39.4254, -0.4178, 39.4697, -0.3773)
    expect(dist).toBeGreaterThan(5)
    expect(dist).toBeLessThan(8)
  })

  it('calcula ~3km entre Paiporta y Catarroja', () => {
    const dist = haversineKm(39.4254, -0.4178, 39.3990, -0.4019)
    expect(dist).toBeGreaterThan(2)
    expect(dist).toBeLessThan(4)
  })

  it('es simétrico (A→B = B→A)', () => {
    const d1 = haversineKm(39.4254, -0.4178, 39.3990, -0.4019)
    const d2 = haversineKm(39.3990, -0.4019, 39.4254, -0.4178)
    expect(d1).toBeCloseTo(d2, 10)
  })

  it('devuelve valores positivos para puntos distintos', () => {
    expect(haversineKm(0, 0, 1, 1)).toBeGreaterThan(0)
  })
})

describe('sortByDistance', () => {
  const puestos = [
    { id: 'lejos',  latitud: 40.0,    longitud:  0.0   },
    { id: 'cerca',  latitud: 39.4254, longitud: -0.4178 },
    { id: 'medio',  latitud: 39.5,    longitud: -0.35   },
  ]
  const userLat = 39.4254
  const userLng = -0.4178

  it('ordena de más cercano a más lejano', () => {
    const sorted = sortByDistance(puestos, userLat, userLng)
    expect(sorted[0].id).toBe('cerca')
    expect(sorted[2].id).toBe('lejos')
  })

  it('añade el campo distanciaKm a cada elemento', () => {
    const sorted = sortByDistance(puestos, userLat, userLng)
    expect(sorted[0].distanciaKm).toBeCloseTo(0, 1)
    expect(sorted[1].distanciaKm).toBeGreaterThan(0)
    expect(sorted[2].distanciaKm).toBeGreaterThan(sorted[1].distanciaKm)
  })

  it('devuelve array vacío si la entrada es vacía', () => {
    expect(sortByDistance([], userLat, userLng)).toEqual([])
  })

  it('preserva los campos originales del objeto', () => {
    const sorted = sortByDistance(puestos, userLat, userLng)
    expect(sorted[0]).toHaveProperty('id')
    expect(sorted[0]).toHaveProperty('latitud')
    expect(sorted[0]).toHaveProperty('longitud')
  })
})
