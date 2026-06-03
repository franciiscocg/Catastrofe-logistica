import type { ItemInventario } from '@/types/inventario.types'

export type OperacionInventarioPuesto = 'entrada' | 'salida' | 'ajuste' | 'necesidad'
export type InventarioPuestoCard = {
  key: string
  producto: ItemInventario['producto']
  disponible?: ItemInventario
  necesario?: ItemInventario
  virtual?: ItemInventario
  cantidadDisponible: number
  cantidadNecesaria: number
  estado: 'disponible' | 'sin-stock' | 'necesario'
  isBasico: boolean
}
export const SUGERENCIAS_INVENTARIO_PUESTO = [
  { nombre: 'Agua embotellada', categoria: 'Bebidas', unidad: 'litros' },
  { nombre: 'Alimentos no perecederos', categoria: 'Alimentacion', unidad: 'kg' },
  { nombre: 'Mantas', categoria: 'Abrigo', unidad: 'unidades' },
  { nombre: 'Medicamentos basicos', categoria: 'Sanidad', unidad: 'kits' },
  { nombre: 'Productos de higiene', categoria: 'Higiene', unidad: 'kits' },
  { nombre: 'Panales', categoria: 'Bebes', unidad: 'paquetes' },
  { nombre: 'Linternas y pilas', categoria: 'Equipamiento', unidad: 'unidades' },
  { nombre: 'Ropa de abrigo', categoria: 'Ropa', unidad: 'prendas' },
]

export function getInventarioProductoKey(producto: Pick<ItemInventario['producto'], 'nombre' | 'unidad'>) {
  return `${producto.nombre.toLocaleLowerCase('es')}:${producto.unidad.toLocaleLowerCase('es')}`
}

export function normalizeInventarioProductoNombre(nombre: string) {
  return nombre.trim().toLocaleLowerCase('es')
}

