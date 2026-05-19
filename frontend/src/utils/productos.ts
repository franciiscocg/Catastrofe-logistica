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

export type InventarioRecord = Record<string, { disponible: ItemInventario[]; necesario?: ItemInventario[] }>

function normalizeNombre(nombre: string) {
  return nombre.trim().toLocaleLowerCase('es')
}

export function getInventarioNeto(inventario: { disponible: ItemInventario[]; necesario?: ItemInventario[] }) {
  const productos = new Map<string, {
    nombre: string
    categoria: string
    unidad: string
    disponible: number
    necesario: number
  }>()

  for (const item of inventario.disponible) {
    const key = normalizeNombre(item.nombre)
    const current = productos.get(key) ?? {
      nombre: item.nombre,
      categoria: item.categoria,
      unidad: item.unidad,
      disponible: 0,
      necesario: 0,
    }
    current.disponible += item.cantidad
    productos.set(key, current)
  }

  for (const item of inventario.necesario ?? []) {
    const key = normalizeNombre(item.nombre)
    const current = productos.get(key) ?? {
      nombre: item.nombre,
      categoria: item.categoria,
      unidad: item.unidad,
      disponible: 0,
      necesario: 0,
    }
    current.necesario += item.cantidad
    productos.set(key, current)
  }

  return [...productos.values()].reduce<{ disponible: ItemInventario[]; necesario: ItemInventario[] }>((acc, item) => {
    const balance = item.disponible - item.necesario
    if (balance > 0) {
      acc.disponible.push({
        nombre: item.nombre,
        categoria: item.categoria,
        unidad: item.unidad,
        cantidad: balance,
      })
    } else if (balance < 0) {
      acc.necesario.push({
        nombre: item.nombre,
        categoria: item.categoria,
        unidad: item.unidad,
        cantidad: Math.abs(balance),
      })
    }
    return acc
  }, { disponible: [], necesario: [] })
}

export function getProductosDisponibles<T extends { id: string }>(
  puestos: T[],
  inventario: InventarioRecord,
): Array<ItemInventario & { puesto: T }> {
  return puestos.flatMap((puesto) =>
    getInventarioNeto(inventario[puesto.id] ?? { disponible: [], necesario: [] }).disponible
      .map((item) => ({ ...item, puesto })),
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
