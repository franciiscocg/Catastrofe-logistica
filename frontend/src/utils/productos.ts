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

export interface ParadaRuta<T extends { id: string }> {
  puesto: T
  productos: string[]
}

export interface OpcionRutaProductos<T extends { id: string }> {
  tipo: 'unico' | 'multi'
  paradas: ParadaRuta<T>[]
  productosEncontrados: string[]
  productosNoEncontrados: string[]
}

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

// Returns top products by number of puestos that stock them, then by total quantity.
export function getProductosRecomendados<T extends { id: string }>(
  disponibles: Array<ItemInventario & { puesto: T }>,
  maxItems = 6,
): ProductoOption[] {
  const map = new Map<string, { option: ProductoOption; puestosSet: Set<string> }>()

  disponibles.forEach((item) => {
    const existing = map.get(item.nombre)
    if (existing) {
      existing.option.total += item.cantidad
      existing.puestosSet.add(item.puesto.id)
    } else {
      map.set(item.nombre, {
        option: { nombre: item.nombre, categoria: item.categoria, unidad: item.unidad, total: item.cantidad },
        puestosSet: new Set([item.puesto.id]),
      })
    }
  })

  return [...map.values()]
    .sort((a, b) => b.puestosSet.size - a.puestosSet.size || b.option.total - a.option.total)
    .slice(0, maxItems)
    .map((e) => e.option)
}

// Computes up to 2 route options for a set of needed products.
// Every option ALWAYS covers all requested products.
// Fallback with partial coverage only when no combination of puestos has all products.
//
// Priority order:
//   1. Nearest single puesto that has all products
//   2. Multi-stop greedy that covers all (shown as alternative when single exists, or primary when not)
//   3. Second nearest single that has all (alternative when no multi-stop exists)
//   4. If nothing covers all: best-effort partial option (multi preferred over single)
export function calcularOpcionesRutaProductos<T extends { id: string; distanciaKm?: number }>(
  productosNecesitados: string[],
  puestosOrdenados: T[],
  inventario: Record<string, { disponible: ItemInventario[] }>,
): OpcionRutaProductos<T>[] {
  if (productosNecesitados.length === 0) return []

  const cobertura = puestosOrdenados
    .map((puesto) => {
      const nombres = new Set((inventario[puesto.id]?.disponible ?? []).map((i) => i.nombre))
      return { puesto, productosAqui: productosNecesitados.filter((p) => nombres.has(p)) }
    })
    .filter((e) => e.productosAqui.length > 0)

  // Single-stop solutions that cover ALL products, sorted by distance
  const singleCompleto = [...cobertura]
    .filter((e) => e.productosAqui.length === productosNecesitados.length)
    .sort((a, b) => (a.puesto.distanciaKm ?? Infinity) - (b.puesto.distanciaKm ?? Infinity))

  // Multi-stop greedy: picks the puesto that covers most pending products (closest on tie)
  const pendientes = new Set(productosNecesitados)
  const paradasMulti: ParadaRuta<T>[] = []
  const usados = new Set<string>()

  while (pendientes.size > 0) {
    const candidato = cobertura
      .filter((e) => !usados.has(e.puesto.id))
      .map((e) => ({ ...e, pendientesAqui: e.productosAqui.filter((p) => pendientes.has(p)) }))
      .filter((e) => e.pendientesAqui.length > 0)
      .sort((a, b) => {
        const diffCov = b.pendientesAqui.length - a.pendientesAqui.length
        if (diffCov !== 0) return diffCov
        return (a.puesto.distanciaKm ?? Infinity) - (b.puesto.distanciaKm ?? Infinity)
      })[0]

    if (!candidato) break
    paradasMulti.push({ puesto: candidato.puesto, productos: candidato.pendientesAqui })
    usados.add(candidato.puesto.id)
    candidato.pendientesAqui.forEach((p) => pendientes.delete(p))
  }

  const multiEncontrados = paradasMulti.flatMap((p) => p.productos)
  const multiCubretodo = multiEncontrados.length === productosNecesitados.length

  const opciones: OpcionRutaProductos<T>[] = []

  // Primary: nearest single that covers all
  if (singleCompleto.length > 0) {
    opciones.push({
      tipo: 'unico',
      paradas: [{ puesto: singleCompleto[0].puesto, productos: singleCompleto[0].productosAqui }],
      productosEncontrados: singleCompleto[0].productosAqui,
      productosNoEncontrados: [],
    })
  }

  // Alternative: multi-stop if it covers all AND has more than 1 stop (genuinely different)
  if (multiCubretodo && paradasMulti.length > 1) {
    opciones.push({
      tipo: 'multi',
      paradas: paradasMulti,
      productosEncontrados: multiEncontrados,
      productosNoEncontrados: [],
    })
  }

  // If no multi-stop alternative, offer the second nearest single
  if (opciones.length < 2 && singleCompleto.length > 1) {
    opciones.push({
      tipo: 'unico',
      paradas: [{ puesto: singleCompleto[1].puesto, productos: singleCompleto[1].productosAqui }],
      productosEncontrados: singleCompleto[1].productosAqui,
      productosNoEncontrados: [],
    })
  }

  // No single but multi covers all: show multi as primary
  if (opciones.length === 0 && multiCubretodo) {
    opciones.push({
      tipo: 'multi',
      paradas: paradasMulti,
      productosEncontrados: multiEncontrados,
      productosNoEncontrados: [],
    })
  }

  // Fallback: nothing covers all — show best-effort partial so the user isn't left blank
  if (opciones.length === 0) {
    if (paradasMulti.length > 0) {
      opciones.push({
        tipo: paradasMulti.length > 1 ? 'multi' : 'unico',
        paradas: paradasMulti,
        productosEncontrados: multiEncontrados,
        productosNoEncontrados: productosNecesitados.filter((p) => !multiEncontrados.includes(p)),
      })
    } else if (cobertura.length > 0) {
      const mejor = [...cobertura].sort((a, b) => b.productosAqui.length - a.productosAqui.length)[0]
      opciones.push({
        tipo: 'unico',
        paradas: [{ puesto: mejor.puesto, productos: mejor.productosAqui }],
        productosEncontrados: mejor.productosAqui,
        productosNoEncontrados: productosNecesitados.filter((p) => !mejor.productosAqui.includes(p)),
      })
    }
  }

  return opciones
}
