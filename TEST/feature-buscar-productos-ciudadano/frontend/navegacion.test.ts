import { describe, expect, it } from 'vitest'
import { distanciaAPolilinea, pasoAlcanzadoPorPosicion, type StepNavegacion } from '../../../frontend/src/utils/navegacion'

const steps: StepNavegacion[] = [
  { instruccion: 'Inicio', calle: '', distanciaM: 100, lat: 39.47, lng: -0.38, tipo: 'depart', icono: 'inicio', legIndex: 0 },
  { instruccion: 'Derecha', calle: '', distanciaM: 100, lat: 39.471, lng: -0.38, tipo: 'turn', icono: 'derecha', legIndex: 0 },
  { instruccion: 'Destino', calle: '', distanciaM: 0, lat: 39.472, lng: -0.379, tipo: 'arrive', icono: 'destino', legIndex: 0 },
]

describe('seguimiento robusto de navegación', () => {
  it('calcula distancia al segmento y no solo a sus vértices', () => {
    expect(distanciaAPolilinea(39.4705, -0.38, [[39.47, -0.38], [39.471, -0.38]])).toBeLessThan(2)
    expect(distanciaAPolilinea(39.4705, -0.379, [[39.47, -0.38], [39.471, -0.38]])).toBeGreaterThan(70)
  })

  it('salta al paso posterior cuando el GPS llega a una maniobra avanzada', () => {
    expect(pasoAlcanzadoPorPosicion(39.471, -0.38, steps, 0)).toBe(2)
    expect(pasoAlcanzadoPorPosicion(39.472, -0.379, steps, 1)).toBe(2)
  })
})
