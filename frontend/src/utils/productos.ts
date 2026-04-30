export interface ItemInventario {
  nombre: string
  categoria: string
  cantidad: number
  unidad: string
}

export interface ProductoOption {
  nombre: string
  categoria: string
  unidad: string
  total: number
}

export type InventarioRecord = Record<string, { disponible: ItemInventario[] }>

export function getProductosDisponibles<T extends { id: string }>(
  puestos: T[],
  inventario: InventarioRecord,
): Array<ItemInventario & { puesto: T }> {
  return puestos.flatMap((puesto) =>
    (inventario[puesto.id]?.disponible ?? []).map((item) => ({ ...item, puesto })),
  )
}

export function getProductoOptions(disponibles: ItemInventario[]): ProductoOption[] {
  const options = new Map<string, ProductoOption>()

  disponibles.forEach((item) => {
    const current = options.get(item.nombre)
    if (current) {
      current.total += item.cantidad
    } else {
      options.set(item.nombre, {
        nombre: item.nombre,
        categoria: item.categoria,
        unidad: item.unidad,
        total: item.cantidad,
      })
    }
  })

  return [...options.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export function matchProductoNombre(texto: string, opciones: ProductoOption[]): string {
  const normalized = texto.trim().toLocaleLowerCase('es')
  if (!normalized) return ''
  const match = opciones.find((o) => o.nombre.toLocaleLowerCase('es') === normalized)
  return match?.nombre ?? ''
}
