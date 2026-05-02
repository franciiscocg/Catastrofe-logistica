export type FaseCatastrofe = 'rescate' | 'limpieza' | 'reconstruccion'
export type TipoCatastrofe = 'inundacion' | 'terremoto' | 'incendio' | 'temporal' | 'otro'

export interface Catastrofe {
  id: string
  nombre: string
  descripcion: string
  tipo: TipoCatastrofe
  latitud: number
  longitud: number
  radio: number
  activa: boolean
  fase: FaseCatastrofe
  createdAt: string
  updatedAt: string
}

export interface PuestoEmergencia {
  id: string
  nombre: string
  descripcion?: string
  direccion: string
  latitud: number
  longitud: number
  tipo: string
  activo: boolean
  catastrofeId: string
  distanciaKm?: number
  capacidadTrabajo?: number
  voluntariosTrabajando?: number
}
