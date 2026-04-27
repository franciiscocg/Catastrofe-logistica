export type TipoInventario = 'disponible' | 'necesario'
export type NivelStock = 'alto' | 'medio' | 'bajo' | 'critico'

export interface Producto {
  id: string
  nombre: string
  categoria: string
  unidad: string
}

export interface ItemInventario {
  id: string
  puestoId: string
  producto: Producto
  cantidad: number
  tipo: TipoInventario
  nivelStock: NivelStock
  updatedAt: string
}
