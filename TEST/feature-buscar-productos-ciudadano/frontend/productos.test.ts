import { describe, it, expect } from 'vitest'
import {
  getProductosDisponibles,
  getProductoOptions,
  matchProductoNombre,
} from '../../../frontend/src/utils/productos'

// ── Inventario de prueba ──────────────────────────────────────────────────────

const INVENTARIO: Record<string, { disponible: Array<{ nombre: string; categoria: string; cantidad: number; unidad: string }> }> = {
  paiporta: {
    disponible: [
      { nombre: 'Agua embotellada',        categoria: 'Bebidas',       cantidad: 100, unidad: 'litros'  },
      { nombre: 'Mantas',                  categoria: 'Abrigo',        cantidad: 10,  unidad: 'unidades' },
    ],
  },
  benetusser: {
    disponible: [
      { nombre: 'Agua embotellada',        categoria: 'Bebidas',       cantidad: 50,  unidad: 'litros'  },
      { nombre: 'Medicamentos básicos',    categoria: 'Sanidad',       cantidad: 5,   unidad: 'kits'    },
    ],
  },
  catarroja: {
    disponible: [
      { nombre: 'Alimentos no perecederos', categoria: 'Alimentación', cantidad: 200, unidad: 'kg'      },
    ],
  },
}

const PUESTOS_BASE = [
  { id: 'paiporta',   nombre: 'CEIP La Paz',     latitud: 39.4254, longitud: -0.4178, necesidades: 0 },
  { id: 'benetusser', nombre: 'Pabellón Norte',  latitud: 39.4328, longitud: -0.3948, necesidades: 0 },
  { id: 'catarroja',  nombre: 'CC Catarroja',    latitud: 39.3990, longitud: -0.4019, necesidades: 0 },
]

// ── getProductosDisponibles ───────────────────────────────────────────────────

describe('getProductosDisponibles', () => {
  it('extrae todos los productos disponibles de todos los puestos', () => {
    const result = getProductosDisponibles(PUESTOS_BASE, INVENTARIO)
    expect(result).toHaveLength(5) // paiporta(2) + benetusser(2) + catarroja(1)
  })

  it('añade referencia al puesto en cada producto', () => {
    const [puesto] = PUESTOS_BASE
    const result = getProductosDisponibles([puesto], INVENTARIO)
    result.forEach((item) => {
      expect(item.puesto).toEqual(puesto)
    })
  })

  it('devuelve los campos del inventario intactos', () => {
    const result = getProductosDisponibles([PUESTOS_BASE[0]], INVENTARIO)
    expect(result[0].nombre).toBe('Agua embotellada')
    expect(result[0].cantidad).toBe(100)
    expect(result[0].unidad).toBe('litros')
  })

  it('devuelve array vacío para puesto sin inventario registrado', () => {
    const puestoDesconocido = [{ id: 'desconocido', nombre: 'X', latitud: 0, longitud: 0, necesidades: 0 }]
    const result = getProductosDisponibles(puestoDesconocido, INVENTARIO)
    expect(result).toHaveLength(0)
  })

  it('devuelve array vacío si no hay puestos', () => {
    expect(getProductosDisponibles([], INVENTARIO)).toHaveLength(0)
  })

  it('solo incluye productos "disponible", no "necesario"', () => {
    const inventarioConNecesario = {
      p1: {
        disponible: [{ nombre: 'Agua', categoria: 'Bebidas', cantidad: 10, unidad: 'litros' }],
        necesario: [{ nombre: 'Mantas', categoria: 'Abrigo', cantidad: 0, unidad: 'unidades' }],
      },
    }
    // getProductosDisponibles solo accede a .disponible
    const result = getProductosDisponibles([{ id: 'p1', nombre: 'X', latitud: 0, longitud: 0, necesidades: 0 }], inventarioConNecesario as any)
    expect(result).toHaveLength(1)
    expect(result[0].nombre).toBe('Agua')
  })
})

// ── getProductoOptions ────────────────────────────────────────────────────────

describe('getProductoOptions', () => {
  it('agrupa cantidades del mismo producto de distintos puestos', () => {
    const disponibles = getProductosDisponibles(PUESTOS_BASE, INVENTARIO)
    const options = getProductoOptions(disponibles)
    const agua = options.find((o) => o.nombre === 'Agua embotellada')
    expect(agua?.total).toBe(150) // 100 + 50
  })

  it('no crea duplicados para el mismo producto', () => {
    const disponibles = getProductosDisponibles(PUESTOS_BASE, INVENTARIO)
    const options = getProductoOptions(disponibles)
    const aguas = options.filter((o) => o.nombre === 'Agua embotellada')
    expect(aguas).toHaveLength(1)
  })

  it('ordena los productos alfabéticamente en español', () => {
    const disponibles = getProductosDisponibles(PUESTOS_BASE, INVENTARIO)
    const options = getProductoOptions(disponibles)
    const nombres = options.map((o) => o.nombre)
    const esperado = [...nombres].sort((a, b) => a.localeCompare(b, 'es'))
    expect(nombres).toEqual(esperado)
  })

  it('devuelve array vacío para input vacío', () => {
    expect(getProductoOptions([])).toEqual([])
  })

  it('preserva categoría y unidad del primer elemento encontrado', () => {
    const disponibles = getProductosDisponibles([PUESTOS_BASE[0]], INVENTARIO)
    const options = getProductoOptions(disponibles)
    const agua = options.find((o) => o.nombre === 'Agua embotellada')
    expect(agua?.categoria).toBe('Bebidas')
    expect(agua?.unidad).toBe('litros')
  })

  it('cuenta correctamente cuando hay un solo puesto', () => {
    const disponibles = getProductosDisponibles([PUESTOS_BASE[0]], INVENTARIO)
    const options = getProductoOptions(disponibles)
    const agua = options.find((o) => o.nombre === 'Agua embotellada')
    expect(agua?.total).toBe(100)
  })
})

// ── matchProductoNombre ───────────────────────────────────────────────────────

describe('matchProductoNombre', () => {
  const opciones = [
    { nombre: 'Agua embotellada',     categoria: 'Bebidas', unidad: 'litros',   total: 150 },
    { nombre: 'Mantas',               categoria: 'Abrigo',  unidad: 'unidades', total: 10  },
    { nombre: 'Medicamentos básicos', categoria: 'Sanidad', unidad: 'kits',     total: 5   },
  ]

  it('devuelve el nombre exacto cuando el texto coincide (case-insensitive)', () => {
    expect(matchProductoNombre('agua embotellada', opciones)).toBe('Agua embotellada')
    expect(matchProductoNombre('MANTAS', opciones)).toBe('Mantas')
  })

  it('devuelve cadena vacía si no hay coincidencia exacta', () => {
    expect(matchProductoNombre('agua', opciones)).toBe('')
    expect(matchProductoNombre('med', opciones)).toBe('')
  })

  it('devuelve cadena vacía para texto vacío', () => {
    expect(matchProductoNombre('', opciones)).toBe('')
    expect(matchProductoNombre('   ', opciones)).toBe('')
  })

  it('ignora espacios al inicio y final', () => {
    expect(matchProductoNombre('  mantas  ', opciones)).toBe('Mantas')
  })
})
