import { useState } from 'react'
import { type ModoTransporte } from '@/utils/routing'
import { type OpcionRutaProductos } from '@/utils/productos'
import { type PuestoMarker } from '@/components/shared/Map'

export type ProductoOption = {
  nombre: string
  categoria: string
  unidad: string
  total: number
}
function getNivelDisponibilidad(total: number) {
  if (total >= 100) {
    return {
      label: 'Alta disponibilidad',
      className: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    }
  }
  if (total >= 25) {
    return {
      label: 'Stock medio',
      className: 'bg-blue-50 text-blue-700 ring-blue-100',
    }
  }
  return {
    label: 'Quedan pocas unidades',
    className: 'bg-amber-50 text-amber-700 ring-amber-100',
  }
}

export function SelectorProductosSheet({
  productosSeleccionados,
  productosRecomendados,
  productoOptions,
  textoBusqueda,
  userPosition,
  onTextoBusquedaChange,
  onAgregarProducto,
  onQuitarProducto,
  onLimpiarProductos,
  onVerRutas,
  onClose,
}: {
  productosSeleccionados: string[]
  productosRecomendados: ProductoOption[]
  productoOptions: ProductoOption[]
  textoBusqueda: string
  userPosition: [number, number] | null
  onTextoBusquedaChange: (texto: string) => void
  onAgregarProducto: (nombre: string) => void
  onQuitarProducto: (nombre: string) => void
  onLimpiarProductos: () => void
  onVerRutas: () => void
  onClose: () => void
}) {
  const [categoriaActiva, setCategoriaActiva] = useState<string>('Todas')

  const textoBusquedaNorm = textoBusqueda.trim().toLocaleLowerCase('es')
  const sugerenciasBase = textoBusquedaNorm
    ? productoOptions.filter((o) =>
        o.nombre.toLocaleLowerCase('es').includes(textoBusquedaNorm) ||
        o.categoria.toLocaleLowerCase('es').includes(textoBusquedaNorm),
      )
    : productoOptions
  const sugerenciasFiltradas = categoriaActiva === 'Todas'
    ? sugerenciasBase
    : sugerenciasBase.filter((o) => o.categoria === categoriaActiva)
  const recomendadosSet = new Set(productosRecomendados.map((p) => p.nombre))
  const sugerencias = [...sugerenciasFiltradas].sort((a, b) => {
    const scoreA = recomendadosSet.has(a.nombre) ? 1 : 0
    const scoreB = recomendadosSet.has(b.nombre) ? 1 : 0
    return scoreB - scoreA || b.total - a.total || a.nombre.localeCompare(b.nombre, 'es')
  })
  const sugerenciasVisibles = sugerencias.slice(0, 12)
  const categoriasDisponibles = Array.from(new Set(productoOptions.map((o) => o.categoria))).slice(0, 7)
  const productosEnCatalogo = productoOptions.length
  const unidadesTotales = productoOptions.reduce((acc, item) => acc + item.total, 0)
  const puedeVerRutas = productosSeleccionados.length > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
      <div className="flex-shrink-0 border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ciudadano</p>
            <h1 className="truncate text-lg font-semibold text-slate-950">Buscar productos</h1>
          </div>
          <div className="hidden grid-cols-3 gap-2 text-center sm:grid">
            <div className="rounded-lg border border-slate-200 px-3 py-1.5">
              <p className="text-sm font-semibold text-slate-950">{productosEnCatalogo}</p>
              <p className="text-[11px] text-slate-500">productos</p>
            </div>
            <div className="rounded-lg border border-slate-200 px-3 py-1.5">
              <p className="text-sm font-semibold text-slate-950">{categoriasDisponibles.length}</p>
              <p className="text-[11px] text-slate-500">categorías</p>
            </div>
            <div className="rounded-lg border border-slate-200 px-3 py-1.5">
              <p className="text-sm font-semibold text-slate-950">{Math.round(unidadesTotales)}</p>
              <p className="text-[11px] text-slate-500">unidades</p>
            </div>
          </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50"
          aria-label="Cerrar búsqueda"
        >
          x
        </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <main className="min-w-0 space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="relative">
                <label className="sr-only">Buscar producto o categoría</label>
                <input
                  type="search"
                  value={textoBusqueda}
                  onChange={(e) => onTextoBusquedaChange(e.target.value)}
                  placeholder="Buscar agua, mantas, medicamentos..."
                  autoComplete="off"
                  className="h-12 w-full rounded-lg border border-slate-300 bg-white px-4 pr-20 text-sm text-slate-950 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                  {sugerencias.length}
                </span>
              </div>

            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {['Todas', ...categoriasDisponibles].map((categoria) => (
                  <button
                    key={categoria}
                    type="button"
                    onClick={() => setCategoriaActiva(categoria)}
                    className={`flex-shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                      categoriaActiva === categoria
                        ? 'bg-slate-950 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {categoria}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-950">Disponibles</h2>
                  <p className="text-xs text-slate-500">{sugerencias.length} resultado{sugerencias.length !== 1 ? 's' : ''}</p>
                </div>
                {textoBusqueda && (
                  <button
                    type="button"
                    onClick={() => onTextoBusquedaChange('')}
                    className="rounded-md px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                  >
                    Limpiar
                  </button>
                )}
              </div>

              {sugerenciasVisibles.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm font-semibold text-slate-950">No hay productos disponibles</p>
                  <p className="mt-1 text-xs text-slate-500">Prueba con otra categoría o un término más general.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {sugerenciasVisibles.map((item) => {
                    const selected = productosSeleccionados.includes(item.nombre)
                    const nivel = getNivelDisponibilidad(item.total)
                    return (
                      <button
                        key={item.nombre}
                        type="button"
                        onClick={() => {
                          if (selected) onQuitarProducto(item.nombre)
                          else onAgregarProducto(item.nombre)
                        }}
                        className="grid w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700">
                            {item.categoria.slice(0, 1).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950">{item.nombre}</p>
                            <p className="truncate text-xs text-slate-500">{item.categoria}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 sm:justify-end">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${nivel.className}`}>
                            {item.total} {item.unidad}
                          </span>
                          <span className={`flex h-8 min-w-24 items-center justify-center rounded-md px-3 text-xs font-semibold ${
                            selected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-950 text-white'
                          }`}>
                            {selected ? 'Añadido' : 'Anadir'}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {sugerencias.length > sugerenciasVisibles.length && (
                <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                  Mostrando los primeros {sugerenciasVisibles.length}. Usa la búsqueda para afinar.
                </p>
              )}
            </section>
          </main>

          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <section className="rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recogida</p>
                  <h2 className="text-sm font-semibold text-slate-950">Tu lista</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {productosSeleccionados.length}
                </span>
              </div>

              {productosSeleccionados.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm font-semibold text-slate-950">Selecciona productos</p>
                  <p className="mt-1 text-xs text-slate-500">Te mostraremos los puestos que mejor cubren la lista.</p>
                </div>
              ) : (
                <div className="space-y-2 p-3">
                  {productosSeleccionados.map((nombre) => {
                    const option = productoOptions.find((o) => o.nombre === nombre)
                    return (
                      <div key={nombre} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{nombre}</p>
                          <p className="truncate text-xs text-slate-500">
                            {option ? `${option.total} ${option.unidad} disponibles` : 'Producto seleccionado'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onQuitarProducto(nombre)}
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Quitar ${nombre}`}
                        >
                          x
                        </button>
                      </div>
                    )
                  })}

                  <button
                    type="button"
                    onClick={onLimpiarProductos}
                    className="flex h-9 w-full items-center justify-center rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Vaciar lista
                  </button>
                </div>
              )}
            </section>

            {!userPosition && productosSeleccionados.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="text-xs font-semibold text-amber-900">Ubicación pendiente</p>
                <p className="mt-0.5 text-xs text-amber-700">Activa tu ubicación para ordenar por cercanía y calcular rutas reales.</p>
              </div>
            )}

            <section className="rounded-lg border border-slate-200 bg-white p-3">
              <button
                type="button"
                onClick={onVerRutas}
                disabled={!puedeVerRutas}
                className="flex h-12 w-full items-center justify-center rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
              >
                {puedeVerRutas
                  ? `Ver mejores opciones (${productosSeleccionados.length})`
                  : 'Selecciona productos'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 flex h-10 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-6 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Volver
              </button>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}

function tiempoEstimadoMin(distanciaKm: number, modo: ModoTransporte): number {
  // Road distance is ~1.3x straight-line; speed: driving 25 km/h urban, walking 4.5 km/h
  const velocidad = modo === 'driving' ? 25 : 4.5
  return Math.max(1, Math.round(distanciaKm * 1.3 / velocidad * 60))
}

export function formatearTiempo(minutos: number): string {
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  const mins = minutos % 60
  return mins > 0 ? `${horas}h ${mins} min` : `${horas}h`
}

export function OpcionesRutaProductosPanel({
  opciones,
  opcionIdx,
  productosSeleccionados,
  modo,
  loading,
  navLoading,
  error,
  userPosition,
  onSeleccionarOpcion,
  onCambiarModo,
  onIniciarNavegacion,
  onVolver,
}: {
  opciones: OpcionRutaProductos<PuestoMarker>[]
  opcionIdx: number
  productosSeleccionados: string[]
  modo: ModoTransporte
  loading: boolean
  navLoading: boolean
  error: string | null
  userPosition: [number, number] | null
  onSeleccionarOpcion: (idx: number) => void
  onCambiarModo: (modo: ModoTransporte) => void
  onIniciarNavegacion: () => void
  onVolver: () => void
}) {
  const opcionActual = opciones[opcionIdx]
  const coberturaActual = opcionActual
    ? `${opcionActual.productosEncontrados.length}/${productosSeleccionados.length}`
    : `0/${productosSeleccionados.length}`
  const etiquetaModo = modo === 'driving' ? 'Coche' : 'A pie'

  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      <div className="border-b border-gray-100 bg-white px-4 py-3">
        <div className="mx-auto w-full max-w-5xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Plan de recogida</p>
            <p className="font-semibold text-gray-950">Mejores opciones</p>
          </div>
          <button
            type="button"
            onClick={onVolver}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            Editar lista
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 px-2 py-2">
            <p className="text-sm font-semibold text-gray-950">{productosSeleccionados.length}</p>
            <p className="text-[11px] text-gray-500">productos</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-2 py-2">
            <p className="text-sm font-semibold text-gray-950">{opcionActual?.paradas.length ?? 0}</p>
            <p className="text-[11px] text-gray-500">paradas</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-2 py-2">
            <p className="text-sm font-semibold text-gray-950">{coberturaActual}</p>
            <p className="text-[11px] text-gray-500">cubierto</p>
          </div>
        </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 py-3 space-y-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => onCambiarModo('driving')}
              className={`h-10 rounded-xl text-sm font-semibold transition-colors ${
                modo === 'driving'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-gray-600 hover:bg-slate-50'
              }`}
            >
              En coche
            </button>
            <button
              type="button"
              onClick={() => onCambiarModo('foot')}
              className={`h-10 rounded-xl text-sm font-semibold transition-colors ${
                modo === 'foot'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-gray-600 hover:bg-slate-50'
              }`}
            >
              A pie
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5">
            <span className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <span className="text-xs font-medium text-blue-800">Calculando ruta en modo {etiquetaModo.toLowerCase()}...</span>
          </div>
        )}

        {error && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {error}
          </p>
        )}

        {!userPosition && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="text-xs font-semibold text-amber-900">Ubicación pendiente</p>
            <p className="mt-0.5 text-xs text-amber-700">Activa tu ubicación para mostrar la ruta exacta sobre el mapa.</p>
          </div>
        )}

        {opciones.length === 0 && !loading && (
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-6 text-center shadow-sm">
            <p className="text-sm font-semibold text-gray-900">No hay opciones disponibles</p>
            <p className="mt-1 text-xs text-gray-500">Prueba con menos productos o con otro recurso similar.</p>
          </div>
        )}

        {opciones.map((opcion, idx) => {
          const isSelected = idx === opcionIdx
          const cubreTodo = opcion.productosNoEncontrados.length === 0
          const totalParadas = opcion.paradas.length
          const distanciaEstimada = opcion.paradas.reduce(
            (acc, p) => acc + (p.puesto.distanciaKm ?? 0),
            0,
          )
          const tiempoEstimado = distanciaEstimada > 0
            ? tiempoEstimadoMin(distanciaEstimada, modo)
            : null
          const titulo = idx === 0
            ? 'Opción recomendada'
            : opcion.tipo === 'multi'
              ? 'Opción completa'
              : 'Alternativa cercana'

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSeleccionarOpcion(idx)}
              className={`w-full rounded-2xl border p-3.5 text-left shadow-sm transition-colors ${
                isSelected
                  ? 'border-slate-900 bg-white ring-2 ring-slate-900/10'
                  : 'border-gray-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-950">{titulo}</p>
                    {isSelected && (
                      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                        Seleccionada
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {totalParadas} parada{totalParadas !== 1 ? 's' : ''}
                    {tiempoEstimado !== null ? ` · aprox. ${formatearTiempo(tiempoEstimado)}` : ''}
                    {distanciaEstimada > 0 ? ` · ${distanciaEstimada.toFixed(1)} km estimados` : ''}
                  </p>
                </div>
                {cubreTodo
                  ? <span className="flex-shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">Completa</span>
                  : <span className="flex-shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">Parcial</span>
                }
              </div>

              <div className="mt-3 space-y-2.5">
                {opcion.paradas.map((parada, pIdx) => (
                  <div key={parada.puesto.id} className="rounded-xl border border-gray-100 bg-slate-50 px-3 py-2.5">
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white text-xs font-bold text-slate-700 ring-1 ring-gray-200">
                        {pIdx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">{parada.puesto.nombre}</p>
                            <p className="mt-0.5 truncate text-xs text-gray-500">{parada.puesto.direccion}</p>
                          </div>
                          {parada.puesto.distanciaKm !== undefined && (
                            <span className="flex-shrink-0 text-xs font-medium text-gray-500">{parada.puesto.distanciaKm.toFixed(1)} km</span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {parada.productos.map((p) => (
                            <span key={p} className="rounded-lg bg-white px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {opcion.productosNoEncontrados.length > 0 && (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  No disponible: {opcion.productosNoEncontrados.join(', ')}
                </p>
              )}
            </button>
          )
        })}

        {userPosition && opciones.length > 0 && (
          <button
            type="button"
            onClick={onIniciarNavegacion}
            disabled={loading || navLoading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-slate-800 disabled:opacity-60"
          >
            {navLoading
              ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Preparando guia...</>
              : 'Iniciar navegación'
            }
          </button>
        )}

        <button
          type="button"
          onClick={onVolver}
          className="flex h-10 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-6 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Volver a la búsqueda
        </button>
      </div>
    </div>
  )
}
