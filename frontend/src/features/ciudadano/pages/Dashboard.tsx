import { useState, useEffect } from 'react'
import Map, { type PuestoMarker } from '@/components/shared/Map'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { useGeolocation } from '@/hooks/useGeolocation'
import { sortByDistance } from '@/utils/haversine'

// ── Datos de ejemplo (sustituir por API en Mes 2) ─────────────────────────────

const PUESTOS_BASE: Omit<PuestoMarker, 'distanciaKm'>[] = [
  { id: '1', nombre: 'CEIP La Paz',                 direccion: 'C/ Major 14, Paiporta',               latitud: 39.4254, longitud: -0.4178, necesidades: 4 },
  { id: '2', nombre: 'Pabellón Municipal Benetússer', direccion: 'Av. del Deportiu 3, Benetússer',     latitud: 39.4328, longitud: -0.3948, necesidades: 2 },
  { id: '3', nombre: 'IES Sedaví',                  direccion: 'C/ Sant Antoni 8, Sedaví',             latitud: 39.4205, longitud: -0.3801, necesidades: 1 },
  { id: '4', nombre: 'Centro Cívico Catarroja',     direccion: "Pl. de l'Ajuntament 1, Catarroja",     latitud: 39.3990, longitud: -0.4019, necesidades: 0 },
  { id: '5', nombre: 'Poliesportiu Alfafar',        direccion: 'C/ Esport 12, Alfafar',                latitud: 39.4148, longitud: -0.3927, necesidades: 3 },
]

type ItemInventario = { nombre: string; categoria: string; cantidad: number; unidad: string }

const INVENTARIO: Record<string, { disponible: ItemInventario[]; necesario: ItemInventario[] }> = {
  '1': {
    disponible: [
      { nombre: 'Agua embotellada',        categoria: 'Bebidas',       cantidad: 240, unidad: 'litros'    },
      { nombre: 'Alimentos no perecederos', categoria: 'Alimentación', cantidad: 80,  unidad: 'kg'         },
      { nombre: 'Mantas',                  categoria: 'Abrigo',        cantidad: 15,  unidad: 'unidades'   },
    ],
    necesario: [
      { nombre: 'Medicamentos básicos',    categoria: 'Sanidad',       cantidad: 0,   unidad: 'kits'       },
      { nombre: 'Ropa de abrigo (M/L)',    categoria: 'Ropa',          cantidad: 0,   unidad: 'prendas'    },
      { nombre: 'Pañales talla 3-5',       categoria: 'Bebés',         cantidad: 0,   unidad: 'paquetes'   },
      { nombre: 'Linternas y pilas',       categoria: 'Equipamiento',  cantidad: 0,   unidad: 'unidades'   },
    ],
  },
  '2': {
    disponible: [
      { nombre: 'Agua embotellada',        categoria: 'Bebidas',       cantidad: 320, unidad: 'litros'    },
      { nombre: 'Ropa de abrigo',          categoria: 'Ropa',          cantidad: 60,  unidad: 'prendas'   },
      { nombre: 'Productos de higiene',    categoria: 'Higiene',       cantidad: 45,  unidad: 'kits'       },
    ],
    necesario: [
      { nombre: 'Alimentos infantiles',    categoria: 'Alimentación',  cantidad: 0,   unidad: 'unidades'   },
      { nombre: 'Sillas de ruedas',        categoria: 'Movilidad',     cantidad: 0,   unidad: 'unidades'   },
    ],
  },
  '3': {
    disponible: [
      { nombre: 'Agua embotellada',        categoria: 'Bebidas',       cantidad: 180, unidad: 'litros'    },
      { nombre: 'Alimentos no perecederos', categoria: 'Alimentación', cantidad: 120, unidad: 'kg'         },
      { nombre: 'Medicamentos básicos',    categoria: 'Sanidad',       cantidad: 8,   unidad: 'kits'       },
      { nombre: 'Calzado (tallas varias)', categoria: 'Calzado',       cantidad: 30,  unidad: 'pares'      },
    ],
    necesario: [
      { nombre: 'Generadores eléctricos',  categoria: 'Equipamiento',  cantidad: 0,   unidad: 'unidades'   },
    ],
  },
  '4': {
    disponible: [
      { nombre: 'Agua embotellada',        categoria: 'Bebidas',       cantidad: 500, unidad: 'litros'    },
      { nombre: 'Alimentos no perecederos', categoria: 'Alimentación', cantidad: 200, unidad: 'kg'         },
      { nombre: 'Ropa de abrigo',          categoria: 'Ropa',          cantidad: 90,  unidad: 'prendas'   },
      { nombre: 'Productos de higiene',    categoria: 'Higiene',       cantidad: 60,  unidad: 'kits'       },
      { nombre: 'Mantas',                  categoria: 'Abrigo',        cantidad: 40,  unidad: 'unidades'   },
    ],
    necesario: [],
  },
  '5': {
    disponible: [
      { nombre: 'Agua embotellada',        categoria: 'Bebidas',       cantidad: 95,  unidad: 'litros'    },
      { nombre: 'Alimentos no perecederos', categoria: 'Alimentación', cantidad: 30,  unidad: 'kg'         },
    ],
    necesario: [
      { nombre: 'Medicamentos básicos',    categoria: 'Sanidad',       cantidad: 0,   unidad: 'kits'       },
      { nombre: 'Ropa de abrigo',          categoria: 'Ropa',          cantidad: 0,   unidad: 'prendas'   },
      { nombre: 'Productos de higiene',    categoria: 'Higiene',       cantidad: 0,   unidad: 'kits'       },
    ],
  },
}

const CATEGORIA_EMOJI: Record<string, string> = {
  Bebidas: '💧', Alimentación: '🍱', Abrigo: '🛏', Sanidad: '💊',
  Ropa: '🧥', Bebés: '👶', Equipamiento: '🔦', Higiene: '🧴',
  Herramientas: '🔧', Calzado: '👟', Movilidad: '♿',
}

// ── Routing via OSRM (demo público) ──────────────────────────────────────────

async function fetchRuta(
  desde: [number, number],
  hasta: [number, number],
): Promise<{ points: [number, number][]; distanciaKm: number; duracionMin: number }> {
  // OSRM espera longitud,latitud (orden inverso a Leaflet)
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${desde[1]},${desde[0]};${hasta[1]},${hasta[0]}` +
    `?overview=full&geometries=geojson`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error('Error al contactar el servidor de rutas')
  const data = await res.json()
  if (data.code !== 'Ok') throw new Error('No se encontró ruta disponible')
  // OSRM devuelve [lng, lat] → convertir a [lat, lng] para Leaflet
  const points: [number, number][] = data.routes[0].geometry.coordinates.map(
    ([lng, lat]: [number, number]) => [lat, lng],
  )
  return {
    points,
    distanciaKm: data.routes[0].distance / 1000,
    duracionMin: Math.round(data.routes[0].duration / 60),
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────


// ── Componente de panel de inventario ─────────────────────────────────────────

function InventarioSheet({
  puesto,
  onClose,
}: {
  puesto: PuestoMarker
  onClose: () => void
}) {
  const inv = INVENTARIO[puesto.id] ?? { disponible: [], necesario: [] }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[2000] flex flex-col bg-white rounded-t-2xl shadow-2xl max-h-[70vh]">
      {/* Handle */}
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 bg-gray-300 rounded-full" />
      </div>

      {/* Cabecera */}
      <div className="flex items-start justify-between px-4 py-2 border-b border-gray-100">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Inventario</p>
          <p className="font-semibold text-gray-900">{puesto.nombre}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Contenido scrollable */}
      <div className="overflow-y-auto flex-1 px-4 pb-6 space-y-5 pt-3">

        {/* Disponible */}
        <section>
          <h3 className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            Disponible ({inv.disponible.length})
          </h3>
          {inv.disponible.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Sin productos disponibles</p>
          ) : (
            <div className="space-y-1">
              {inv.disponible.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{CATEGORIA_EMOJI[item.categoria] ?? '📦'}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.nombre}</p>
                      <p className="text-xs text-gray-400">{item.categoria}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-green-700">
                    {item.cantidad} {item.unidad}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Necesario */}
        {inv.necesario.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
              Necesitamos ({inv.necesario.length})
            </h3>
            <div className="space-y-1">
              {inv.necesario.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{CATEGORIA_EMOJI[item.categoria] ?? '📦'}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.nombre}</p>
                      <p className="text-xs text-gray-400">{item.categoria}</p>
                    </div>
                  </div>
                  <Badge variant="danger">Urgente</Badge>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

// ── Dashboard principal ───────────────────────────────────────────────────────

type Vista = 'default' | 'ruta' | 'inventario' | 'reportar' | 'buscar'

export default function CiudadanoDashboard() {
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null)
  const [vista, setVista]             = useState<Vista>('default')
  const [route, setRoute]             = useState<[number, number][] | null>(null)
  const [routeInfo, setRouteInfo]     = useState<{ distanciaKm: number; duracionMin: number } | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError]   = useState<string | null>(null)

  const { position, loading: geoLoading, request: requestGeo } = useGeolocation()

  useEffect(() => {
    if (position) setUserPosition([position.lat, position.lng])
  }, [position])

  // Limpiar ruta/inventario al cambiar de puesto
  const handleSelectPuesto = (id: string) => {
    if (id === selectedId) {
      setSelectedId(null)
      setVista('default')
      setRoute(null)
      setRouteInfo(null)
    } else {
      setSelectedId(id)
      setVista('default')
      setRoute(null)
      setRouteInfo(null)
      setRouteError(null)
    }
  }

  const handleComoLlegar = async () => {
    const puesto = puestos.find((p) => p.id === selectedId)
    if (!puesto) return

    if (!userPosition) {
      setRouteError('Comparte tu ubicación primero para calcular la ruta')
      return
    }

    setRouteLoading(true)
    setRouteError(null)
    try {
      const resultado = await fetchRuta(userPosition, [puesto.latitud, puesto.longitud])
      setRoute(resultado.points)
      setRouteInfo({ distanciaKm: resultado.distanciaKm, duracionMin: resultado.duracionMin })
      setVista('ruta')
    } catch (e) {
      setRouteError(e instanceof Error ? e.message : 'No se pudo calcular la ruta')
    } finally {
      setRouteLoading(false)
    }
  }

  const handleCancelarRuta = () => {
    setRoute(null)
    setRouteInfo(null)
    setVista('default')
    setRouteError(null)
  }

  const puestos: PuestoMarker[] = userPosition
    ? sortByDistance(PUESTOS_BASE, userPosition[0], userPosition[1])
    : PUESTOS_BASE.map((p) => ({ ...p }))

  const selectedPuesto = selectedId ? puestos.find((p) => p.id === selectedId) ?? null : null

  return (
    <div className="flex flex-col h-full">

      {/* Banner catástrofe */}
      <div className="bg-red-600 text-white px-4 py-2 flex-shrink-0">
        <p className="text-xs font-medium uppercase tracking-wide">Catástrofe activa</p>
        <p className="font-semibold text-sm">DANA Valencia — Fase: Limpieza</p>
      </div>

      {/* Banner de ruta activa */}
      {vista === 'ruta' && routeInfo && (
        <div className="bg-blue-600 text-white px-4 py-2 flex items-center justify-between flex-shrink-0">
          <span className="text-sm">
            🚗 <strong>{routeInfo.distanciaKm.toFixed(1)} km</strong>
            {' · ~'}<strong>{routeInfo.duracionMin} min</strong>
            {selectedPuesto && ` · ${selectedPuesto.nombre}`}
          </span>
          <button
            onClick={handleCancelarRuta}
            className="text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded-lg transition-colors"
          >
            ✕ Cancelar
          </button>
        </div>
      )}

      {/* Mapa */}
      <div className="relative flex-shrink-0" style={{ height: '50vh' }}>
        <Map
          center={[39.4250, -0.4000]}
          zoom={13}
          userPosition={userPosition}
          puestos={puestos}
          selectedPuestoId={selectedId}
          onPuestoSelect={handleSelectPuesto}
          onUserLocated={setUserPosition}
          route={route}
          markerVariant="neutral"
          className="h-full w-full"
        />

        {/* Botón localizarme */}
        <button
          onClick={requestGeo}
          disabled={geoLoading}
          className="absolute top-3 right-12 z-[1000] bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 shadow-md hover:bg-gray-50 transition-colors disabled:opacity-60"
        >
          {geoLoading ? '🔄 Localizando…' : '📍 Localizarme'}
        </button>

      </div>

      {/* Acciones rápidas */}
      <div className="px-4 py-2.5 grid grid-cols-2 gap-2 border-b border-gray-100 bg-white flex-shrink-0">
        <Button variant="secondary" size="sm" fullWidth onClick={() => setVista('reportar')}>
          📍 Reportar calle
        </Button>
        <Button variant="secondary" size="sm" fullWidth onClick={() => setVista('buscar')}>
          🔍 Buscar producto
        </Button>
      </div>

      {/* Lista de puestos */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm">
            Puestos de emergencia
            <span className="ml-1.5 font-normal text-gray-400">({puestos.length})</span>
          </h2>
          {userPosition && <span className="text-xs text-blue-600">Por distancia</span>}
        </div>

        <div className="px-4 pb-6 space-y-2">
          {puestos.map((puesto) => {
            const isSelected = puesto.id === selectedId

            return (
              <div key={puesto.id}>
                <button
                  onClick={() => handleSelectPuesto(puesto.id)}
                  className={`w-full text-left rounded-xl p-3.5 border-2 transition-all ${
                    isSelected
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-blue-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 border-2 border-white shadow-sm flex items-center justify-center text-base flex-shrink-0">
                      🏪
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-gray-900 text-sm truncate">{puesto.nombre}</p>
                        {puesto.distanciaKm !== undefined && (
                          <span className="text-xs text-gray-400 flex-shrink-0">{puesto.distanciaKm.toFixed(1)} km</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{puesto.direccion}</p>
                    </div>
                  </div>

                  {/* Acciones del puesto seleccionado */}
                  {isSelected && (
                    <div
                      className="mt-3 pt-3 border-t border-blue-200 grid grid-cols-2 gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="sm"
                        variant="primary"
                        fullWidth
                        onClick={() => setVista('inventario')}
                      >
                        📦 Ver inventario
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        fullWidth
                        loading={routeLoading}
                        onClick={handleComoLlegar}
                      >
                        {vista === 'ruta' ? '🗺 Ver ruta' : '🚗 Cómo llegar'}
                      </Button>
                    </div>
                  )}

                  {/* Error de ruta */}
                  {isSelected && routeError && (
                    <p
                      className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {routeError}
                    </p>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Panel de inventario (bottom sheet) */}
      {vista === 'inventario' && selectedPuesto && (
        <InventarioSheet puesto={selectedPuesto} onClose={() => setVista('default')} />
      )}
    </div>
  )
}
