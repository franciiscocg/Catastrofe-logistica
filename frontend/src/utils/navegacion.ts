import { haversineKm } from './haversine'

export type DireccionIcono =
  | 'recto'
  | 'izquierda-leve' | 'izquierda' | 'izquierda-fuerte'
  | 'derecha-leve'   | 'derecha'   | 'derecha-fuerte'
  | 'media-vuelta'
  | 'rotonda'
  | 'inicio'
  | 'destino'

export interface StepNavegacion {
  instruccion: string
  calle: string
  distanciaM: number
  lat: number
  lng: number
  tipo: string
  icono: DireccionIcono
}

// Degrees to rotate an ↑ arrow to represent each maneuver visually
export const ROTACION_ICONO: Record<DireccionIcono, number> = {
  'recto':             0,
  'izquierda-leve':  -30,
  'izquierda':       -90,
  'izquierda-fuerte': -135,
  'media-vuelta':     180,
  'derecha-leve':      30,
  'derecha':           90,
  'derecha-fuerte':   135,
  'rotonda':           45,
  'inicio':             0,
  'destino':            0,
}

function iconoModifier(modifier: string): DireccionIcono {
  switch (modifier) {
    case 'slight left':  return 'izquierda-leve'
    case 'left':         return 'izquierda'
    case 'sharp left':   return 'izquierda-fuerte'
    case 'uturn':        return 'media-vuelta'
    case 'slight right': return 'derecha-leve'
    case 'right':        return 'derecha'
    case 'sharp right':  return 'derecha-fuerte'
    default:             return 'recto'
  }
}

export function instruccionEspanol(
  tipo: string,
  modifier: string,
  calle: string,
  salidaRotonda?: number,
): string {
  const enCalle = calle ? ` en ${calle}` : ''
  switch (tipo) {
    case 'depart':
      return calle ? `Empieza por ${calle}` : 'Empieza la ruta'
    case 'arrive':
      return 'Has llegado a tu destino'
    case 'continue':
    case 'new name':
    case 'notification':
      return calle ? `Continúa por ${calle}` : 'Continúa recto'
    case 'turn':
    case 'end of road': {
      switch (modifier) {
        case 'straight':     return `Continúa recto${enCalle}`
        case 'slight left':  return `Gira ligeramente a la izquierda${enCalle}`
        case 'left':         return `Gira a la izquierda${enCalle}`
        case 'sharp left':   return `Gira fuertemente a la izquierda${enCalle}`
        case 'slight right': return `Gira ligeramente a la derecha${enCalle}`
        case 'right':        return `Gira a la derecha${enCalle}`
        case 'sharp right':  return `Gira fuertemente a la derecha${enCalle}`
        case 'uturn':        return `Da la vuelta${enCalle}`
        default:             return `Gira${enCalle}`
      }
    }
    case 'roundabout':
    case 'rotary': {
      const sal = salidaRotonda ? `la ${salidaRotonda}ª salida` : 'la salida'
      return calle ? `Toma ${sal} en la rotonda hacia ${calle}` : `Toma ${sal} en la rotonda`
    }
    case 'fork': {
      const lado = modifier.includes('left') ? 'izquierda' : 'derecha'
      return `En el cruce, ve por la ${lado}${enCalle}`
    }
    case 'merge':    return `Incorpórate${enCalle}`
    case 'on ramp':  return `Coge la rampa de acceso${enCalle}`
    case 'off ramp': return `Sal por la rampa${enCalle}`
    case 'use lane': return `Usa el carril correcto${enCalle}`
    default:         return calle ? `Dirígete por ${calle}` : 'Continúa'
  }
}

interface OsrmRawStep {
  distance: number
  name: string
  maneuver: {
    type: string
    modifier?: string
    location: [number, number] // [lng, lat]
    exit?: number
  }
}

export function parsearStepsOsrm(
  legs: { steps: OsrmRawStep[] }[],
): StepNavegacion[] {
  return legs.flatMap((leg) =>
    leg.steps.map((step) => {
      const tipo     = step.maneuver.type
      const modifier = step.maneuver.modifier ?? 'straight'
      const calle    = step.name ?? ''
      const icono: DireccionIcono =
        tipo === 'depart'                             ? 'inicio'
        : tipo === 'arrive'                           ? 'destino'
        : tipo === 'roundabout' || tipo === 'rotary'  ? 'rotonda'
        : iconoModifier(modifier)
      return {
        instruccion: instruccionEspanol(tipo, modifier, calle, step.maneuver.exit),
        calle,
        distanciaM:  Math.round(step.distance),
        lat:         step.maneuver.location[1],
        lng:         step.maneuver.location[0],
        tipo,
        icono,
      }
    }),
  )
}

export function formatearDistanciaNav(metros: number): string {
  if (metros < 10)   return 'aquí'
  if (metros < 1000) return `${Math.round(metros / 10) * 10} m`
  return `${(metros / 1000).toFixed(1)} km`
}

// Haversine bearing in degrees [0, 360) from North, clockwise
export function calcularBearing(
  fromLat: number, fromLng: number,
  toLat: number,   toLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLng  = toRad(toLng - fromLng)
  const fLat  = toRad(fromLat)
  const tLat  = toRad(toLat)
  const y = Math.sin(dLng) * Math.cos(tLat)
  const x = Math.cos(fLat) * Math.sin(tLat) - Math.sin(fLat) * Math.cos(tLat) * Math.cos(dLng)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

// Distance in metres between user and the step maneuver point
export function distanciaAlStep(
  userLat: number, userLng: number,
  step: StepNavegacion,
): number {
  return haversineKm(userLat, userLng, step.lat, step.lng) * 1000
}
