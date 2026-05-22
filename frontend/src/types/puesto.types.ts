export interface PuestoEmergencia {
  id: string
  nombre: string
  descripcion?: string
  direccion: string
  latitud: number
  longitud: number
  tipo: string
  activo: boolean
  distanciaKm?: number
  capacidadTrabajo?: number
  voluntariosTrabajando?: number
}
