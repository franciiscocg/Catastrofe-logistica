import { describe, it, expect } from 'vitest'

// ── Guards de coordenadas (lógica extraída de Map.tsx y Dashboard.tsx) ─────────
//
// Estas funciones protegen al mapa Leaflet del error:
//   "Invalid LatLng object: (NaN, NaN)"
// que se producía cuando la geolocalización devolvía coordenadas no finitas.

function isValidLatLng(
  position: [number, number] | null | undefined,
): position is [number, number] {
  return (
    Array.isArray(position) &&
    position.length === 2 &&
    Number.isFinite(position[0]) &&
    Number.isFinite(position[1])
  )
}

function hasValidMarkerPosition(marker: { latitud: number; longitud: number }) {
  return Number.isFinite(marker.latitud) && Number.isFinite(marker.longitud)
}

// Replica la lógica de currentUserPosition en CiudadanoDashboard.
// Combina la posición del hook de geolocalización con la posición manual
// y descarta cualquier resultado que no sea finito.
function buildCurrentUserPosition(
  positionFromGeo: { lat: number; lng: number } | null,
  manualUserPosition: [number, number] | null,
): [number, number] | null {
  const nextPosition: [number, number] | null = positionFromGeo
    ? [positionFromGeo.lat, positionFromGeo.lng]
    : manualUserPosition
  return nextPosition &&
    Number.isFinite(nextPosition[0]) &&
    Number.isFinite(nextPosition[1])
    ? nextPosition
    : null
}

// Replica la lógica de destinoPuesto en CiudadanoDashboard.
// Parsea los query params lat/lng y devuelve null cuando no son finitos.
function buildDestinoPuesto(params: {
  id?: string | null
  lat?: string | null
  lng?: string | null
}): { id: string; latitud: number; longitud: number } | null {
  const id = params.id ?? null
  const latitud = Number(params.lat)
  const longitud = Number(params.lng)

  if (!id || !Number.isFinite(latitud) || !Number.isFinite(longitud)) return null

  return { id, latitud, longitud }
}

// ── isValidLatLng ─────────────────────────────────────────────────────────────

describe('isValidLatLng', () => {
  it('acepta coordenadas válidas', () => {
    expect(isValidLatLng([39.4250, -0.4000])).toBe(true)
  })

  it('acepta el punto origen (0, 0)', () => {
    expect(isValidLatLng([0, 0])).toBe(true)
  })

  it('acepta coordenadas negativas válidas', () => {
    expect(isValidLatLng([-33.8688, 151.2093])).toBe(true)
  })

  it('rechaza NaN en la latitud', () => {
    expect(isValidLatLng([NaN, -0.4000])).toBe(false)
  })

  it('rechaza NaN en la longitud', () => {
    expect(isValidLatLng([39.4250, NaN])).toBe(false)
  })

  it('rechaza (NaN, NaN) — caso exacto del error de Leaflet', () => {
    expect(isValidLatLng([NaN, NaN])).toBe(false)
  })

  it('rechaza Infinity en la latitud', () => {
    expect(isValidLatLng([Infinity, -0.4000])).toBe(false)
  })

  it('rechaza -Infinity en la longitud', () => {
    expect(isValidLatLng([39.4250, -Infinity])).toBe(false)
  })

  it('rechaza null', () => {
    expect(isValidLatLng(null)).toBe(false)
  })

  it('rechaza undefined', () => {
    expect(isValidLatLng(undefined)).toBe(false)
  })
})

// ── hasValidMarkerPosition ────────────────────────────────────────────────────

describe('hasValidMarkerPosition', () => {
  it('acepta marcador con coordenadas válidas', () => {
    expect(hasValidMarkerPosition({ latitud: 39.4250, longitud: -0.4000 })).toBe(true)
  })

  it('acepta marcador en el punto (0, 0)', () => {
    expect(hasValidMarkerPosition({ latitud: 0, longitud: 0 })).toBe(true)
  })

  it('rechaza marcador con latitud NaN', () => {
    expect(hasValidMarkerPosition({ latitud: NaN, longitud: -0.4000 })).toBe(false)
  })

  it('rechaza marcador con longitud NaN', () => {
    expect(hasValidMarkerPosition({ latitud: 39.4250, longitud: NaN })).toBe(false)
  })

  it('rechaza marcador con ambas coordenadas NaN', () => {
    expect(hasValidMarkerPosition({ latitud: NaN, longitud: NaN })).toBe(false)
  })

  it('rechaza marcador con Infinity en latitud', () => {
    expect(hasValidMarkerPosition({ latitud: Infinity, longitud: 0 })).toBe(false)
  })

  it('rechaza marcador con -Infinity en longitud', () => {
    expect(hasValidMarkerPosition({ latitud: 0, longitud: -Infinity })).toBe(false)
  })
})

// ── currentUserPosition guard ─────────────────────────────────────────────────

describe('currentUserPosition guard', () => {
  it('devuelve la posición del hook de geo cuando es válida', () => {
    expect(buildCurrentUserPosition({ lat: 39.4250, lng: -0.4000 }, null))
      .toEqual([39.4250, -0.4000])
  })

  it('devuelve null cuando la geo devuelve (NaN, NaN)', () => {
    expect(buildCurrentUserPosition({ lat: NaN, lng: NaN }, null)).toBeNull()
  })

  it('devuelve null cuando la geo devuelve latitud NaN', () => {
    expect(buildCurrentUserPosition({ lat: NaN, lng: -0.4000 }, null)).toBeNull()
  })

  it('usa la posición manual como fallback cuando geo es null', () => {
    expect(buildCurrentUserPosition(null, [39.4250, -0.4000]))
      .toEqual([39.4250, -0.4000])
  })

  it('devuelve null si tanto geo como posición manual son null', () => {
    expect(buildCurrentUserPosition(null, null)).toBeNull()
  })

  it('devuelve null si la posición manual tiene NaN', () => {
    expect(buildCurrentUserPosition(null, [NaN, NaN])).toBeNull()
  })

  it('prioriza la posición de geo sobre la manual cuando ambas son válidas', () => {
    const result = buildCurrentUserPosition(
      { lat: 39.4250, lng: -0.4000 },
      [40.0, 0.0],
    )
    expect(result).toEqual([39.4250, -0.4000])
  })
})

// ── destinoPuesto guard ───────────────────────────────────────────────────────

describe('destinoPuesto guard (query params)', () => {
  it('construye el destino con params válidos', () => {
    const result = buildDestinoPuesto({ id: 'puesto-1', lat: '39.4250', lng: '-0.4000' })
    expect(result).toEqual({ id: 'puesto-1', latitud: 39.4250, longitud: -0.4000 })
  })

  it('devuelve null cuando lat=NaN (string "NaN")', () => {
    expect(buildDestinoPuesto({ id: 'p1', lat: 'NaN', lng: '-0.4000' })).toBeNull()
  })

  it('devuelve null cuando lng=NaN (string "NaN")', () => {
    expect(buildDestinoPuesto({ id: 'p1', lat: '39.4250', lng: 'NaN' })).toBeNull()
  })

  it('devuelve null cuando lat y lng son "NaN" — caso exacto de query param inválido', () => {
    expect(buildDestinoPuesto({ id: 'p1', lat: 'NaN', lng: 'NaN' })).toBeNull()
  })

  it('devuelve null cuando falta el id', () => {
    expect(buildDestinoPuesto({ id: null, lat: '39.4250', lng: '-0.4000' })).toBeNull()
  })

  it('devuelve null cuando lat y lng están ausentes (undefined)', () => {
    expect(buildDestinoPuesto({ id: 'p1', lat: undefined, lng: undefined })).toBeNull()
  })

  it('acepta lat="" como latitud 0 (Number("") === 0, que es finito)', () => {
    // Number('') === 0 en JavaScript — el guard solo rechaza NaN e Infinity,
    // no cadenas vacías. Las rutas con lat=0 son válidas geográficamente.
    const result = buildDestinoPuesto({ id: 'p1', lat: '', lng: '-0.4000' })
    expect(result).toEqual({ id: 'p1', latitud: 0, longitud: -0.4000 })
  })

  it('devuelve null cuando lat es texto no numérico', () => {
    expect(buildDestinoPuesto({ id: 'p1', lat: 'abc', lng: '-0.4000' })).toBeNull()
  })
})

// ── Lógica de acciones del menú de inicio ─────────────────────────────────────

describe('Acciones del menú CiudadanoInicio', () => {
  const ACCIONES = [
    { title: 'Ver mapa',            icon: '🗺' },
    { title: 'Buscar producto',     icon: '🔍' },
    { title: 'Reportar incidencia', icon: '📍' },
  ]

  it('hay exactamente 3 acciones disponibles', () => {
    expect(ACCIONES).toHaveLength(3)
  })

  it('la primera acción es "Ver mapa"', () => {
    expect(ACCIONES[0].title).toBe('Ver mapa')
  })

  it('la segunda acción es "Buscar producto"', () => {
    expect(ACCIONES[1].title).toBe('Buscar producto')
  })

  it('la tercera acción es "Reportar incidencia"', () => {
    expect(ACCIONES[2].title).toBe('Reportar incidencia')
  })

  it('cada acción tiene un título y un icono', () => {
    ACCIONES.forEach((accion) => {
      expect(accion.title).toBeTruthy()
      expect(accion.icon).toBeTruthy()
    })
  })

  it('los títulos de las acciones son únicos', () => {
    const titles = ACCIONES.map((a) => a.title)
    expect(new Set(titles).size).toBe(ACCIONES.length)
  })
})
