import { useState, useMemo, useEffect, useRef } from 'react'
import { apiClient } from '@/lib/api/client'
import { queueableApiRequest } from '@/lib/api/offline'
import { useGeolocation } from '@/hooks/useGeolocation'
import Map, { type IncidenciaMarker } from '@/components/shared/Map'
import ReadableQrCode from '@/components/shared/ReadableQrCode'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { Notice, RouteSafetyPanel } from '@/features/voluntario/components/DashboardUi'
import { fetchRutaMultiParada, fetchRutaConPasos } from '@/utils/routing'
import { parsearStepsOsrm, formatearDistanciaNav, calcularBearing, distanciaAlStep, ROTACION_ICONO, type StepNavegacion } from '@/utils/navegacion'
import { haversineKm } from '@/utils/haversine'

// Emojis for categories
const CATEGORIA_EMOJI: Record<string, string> = {
  Bebidas: '💧', Alimentación: '🍱', Abrigo: '🛏', Sanidad: '💊',
  Ropa: '🧥', Bebés: '👶', Equipamiento: '🔦', Higiene: '🧴',
  Herramientas: '🔧', Calzado: '👟', Movilidad: '♿', Limpieza: '🧹',
}

interface Producto {
  id: string
  nombre: string
  categoria: string
  unidad: string
}
/*
interface ItemInventario {
  id: string
  puestoId: string
  producto: Producto
  cantidad: number
  tipo: 'disponible' | 'necesario'
  nivelStock: 'bajo' | 'medio' | 'alto' | 'critico'
  updatedAt: string
}
*/

interface PuestoEmergencia {
  id: string
  nombre: string
  direccion: string
  latitud: number
  longitud: number
  tipo: string
  activo: boolean
}

interface Necesidad {
  puesto: PuestoEmergencia
  item: any
  cantidadNecesaria?: number
  cantidadComprometida?: number
  cantidadPendiente?: number
  prioridad?: string
}

interface ObjetoDonable {
  key: string
  producto: Producto
  necesidades: Necesidad[]
  cantidadTotal: number
}

interface AllocationStop {
  puesto: PuestoEmergencia
  productos: Array<{
    producto: Producto
    cantidad: number
    unidad: string
    necesidad: Necesidad
  }>
}

interface Donacion {
  id: string
  cantidad: number
  unidad: string
  estado: 'PENDIENTE' | 'EN_CAMINO' | 'ENTREGADA' | 'CANCELADA'
  comentario?: string | null
  eta?: string | null
  entregaCodigo?: string | null
  entregaCodigoGeneradoAt?: string | null
  producto: any
  puesto: PuestoEmergencia
}

function createCodigoEntregaPayload(donacion: Donacion, entregaCodigo: string, cantidadActualizada?: number) {
  return JSON.stringify({
    t: 'DE',
    v: 1,
    e: entregaCodigo,
    d: donacion.id,
    p: donacion.puesto.id,
    pr: donacion.producto.id,
    q: cantidadActualizada ?? donacion.cantidad,
    u: donacion.unidad,
    g: Date.now(),
  })
}

// ── Arrow SVG used in the navigation compass ─────────────────────────────────
function FlechaNavegacion({
  icono,
  rotacion,
  grande = false,
}: {
  icono: string
  rotacion: number
  grande?: boolean
}) {
  const size = grande ? 80 : 56
  if (icono === 'destino') {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" className="mx-auto" aria-hidden>
        <circle cx="40" cy="40" r="28" fill="#16a34a" />
        <text x="40" y="47" textAnchor="middle" fontSize="24" fill="white">★</text>
      </svg>
    )
  }
  if (icono === 'rotonda') {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" className="mx-auto" aria-hidden>
        <circle cx="40" cy="40" r="28" stroke="#0891b2" strokeWidth="6" fill="none" />
        <path d="M54 30 L62 38 L54 46" stroke="#0891b2" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    )
  }
  return (
    <div className="mx-auto" style={{ transform: `rotate(${rotacion}deg)`, transition: 'transform 0.3s ease', width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden>
        <path d="M40 8 L58 62 L40 50 L22 62 Z" fill="#0891b2" />
      </svg>
    </div>
  )
}

export default function NuevoFlujoDonacion({
  objetosDonables,
  userPosition: initialUserPosition,
  incidencias,
  onFinalizarDonacion,
  onVolverDashboard,
  initialStep,
  initialDonations,
}: {
  objetosDonables: ObjetoDonable[]
  userPosition: [number, number] | null
  incidencias: IncidenciaMarker[]
  onFinalizarDonacion: () => void
  onVolverDashboard: () => void
  initialStep?: 'productos' | 'cantidades' | 'rutas' | 'navegacion' | 'entregas-qr'
  initialDonations?: Donacion[]
}) {
  const [step, setStep] = useState<'productos' | 'cantidades' | 'rutas' | 'navegacion' | 'entregas-qr'>(initialStep ?? 'productos')
  
  // Geolocation
  const { position: geoPos, request: requestGeo } = useGeolocation()
  const [userPosition, setUserPosition] = useState<[number, number] | null>(initialUserPosition)
  
  useEffect(() => {
    if (geoPos) setUserPosition([geoPos.lat, geoPos.lng])
  }, [geoPos])

  // Step 1 states
  const [selectedProductKeys, setSelectedProductKeys] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('todos')

  // Step 2 states
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  
  // Step 3 states
  const [routeProposals, setRouteProposals] = useState<Array<{
    stops: AllocationStop[]
    points: [number, number][]
    distanciaKm: number
    duracionMin: number
    incidenciasEvitadas: number
    incidenciasCercanas: number
  }>>([])
  const [selectedRouteIdx, setSelectedRouteIdx] = useState<number>(0)
  const [loadingRoutes, setLoadingRoutes] = useState(false)
  const [routeError, setRouteError] = useState('')

  // Step 4 states
  const [createdDonations, setCreatedDonations] = useState<Donacion[]>(initialDonations ?? [])
  const [stopsToDeliver, setStopsToDeliver] = useState<AllocationStop[]>(() => {
    if (!initialDonations || initialDonations.length === 0) return []
    const byPuesto = new globalThis.Map<string, AllocationStop>()
    initialDonations.forEach((donacion) => {
      const pId = donacion.puesto.id
      if (!byPuesto.has(pId)) {
        byPuesto.set(pId, { puesto: donacion.puesto, productos: [] })
      }
      byPuesto.get(pId)!.productos.push({
        producto: donacion.producto,
        cantidad: donacion.cantidad,
        unidad: donacion.unidad,
        necesidad: {
          puesto: donacion.puesto,
          item: { producto: donacion.producto, cantidad: donacion.cantidad },
          cantidadNecesaria: donacion.cantidad,
          cantidadPendiente: 0,
        }
      })
    })
    return Array.from(byPuesto.values())
  })
  const [currentStopIdx, setCurrentStopIdx] = useState(0)
  const [stepsNavegacion, setStepsNavegacion] = useState<StepNavegacion[]>([])
  const [stepActualIdx, setStepActualIdx] = useState(0)
  const [navLoading, setNavLoading] = useState(false)
  const [vozActiva, setVozActiva] = useState(true)
  const [headingDispositivo, setHeadingDispositivo] = useState<number | null>(null)
  const announcementsRef = useRef<Set<string>>(new Set())

  // Step 5 states: Delivery and quantity overrides
  const [deliveryQuantities, setDeliveryQuantities] = useState<Record<string, number>>({}) // donacionId -> quantity

  // Voice navigation logic: text-to-speech
  useEffect(() => {
    if (step !== 'navegacion' || stepsNavegacion.length === 0) return

    const stepObj = stepsNavegacion[stepActualIdx]
    if (!stepObj) return

    const anuncio = `${stepObj.instruccion}. ${stepObj.distanciaM > 10 ? `A ${formatearDistanciaNav(stepObj.distanciaM)}` : ''}`
    if (vozActiva && typeof speechSynthesis !== 'undefined' && !announcementsRef.current.has(anuncio)) {
      speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(stepObj.instruccion)
      utterance.lang = 'es-ES'
      speechSynthesis.speak(utterance)
      announcementsRef.current.add(anuncio)
    }
  }, [step, stepActualIdx, stepsNavegacion, vozActiva])

  // Device orientation for compass
  useEffect(() => {
    if (step !== 'navegacion') return

    const handleOrientation = (event: DeviceOrientationEvent) => {
      const heading = (event as { webkitCompassHeading?: number }).webkitCompassHeading ?? event.alpha
      if (heading !== null && heading !== undefined) {
        setHeadingDispositivo(360 - heading)
      }
    }

    window.addEventListener('deviceorientation', handleOrientation)
    return () => window.removeEventListener('deviceorientation', handleOrientation)
  }, [step])

  // Poll donations state in background when waiting for delivery scan
  useEffect(() => {
    if (step !== 'entregas-qr' || createdDonations.length === 0) return

    let cancelled = false
    const currentStop = stopsToDeliver[currentStopIdx]
    if (!currentStop) return

    const checkStopDonations = async () => {
      try {
        const { data } = await apiClient.get('/api/donaciones/mis-donaciones')
        if (cancelled) return

        const freshDonations = (data.donaciones ?? []) as Donacion[]
        // Find if all active donations for the current stop are marked as ENTREGADA
        const stopDonationIds = new Set(
          createdDonations
            .filter((d) => d.puesto.id === currentStop.puesto.id)
            .map((d) => d.id)
        )

        const stopDonationsInApi = freshDonations.filter((d) => stopDonationIds.has(d.id))
        const allDelivered = stopDonationsInApi.length > 0 && stopDonationsInApi.every((d) => d.estado === 'ENTREGADA')

        if (allDelivered) {
          // Success announcement
          if (vozActiva && typeof speechSynthesis !== 'undefined') {
            const utterance = new SpeechSynthesisUtterance('Entrega confirmada. Muchas gracias por tu ayuda.')
            utterance.lang = 'es-ES'
            speechSynthesis.speak(utterance)
          }

          if (currentStopIdx < stopsToDeliver.length - 1) {
            // Move to next stop! Compute next leg of the route
            setCurrentStopIdx((prev) => prev + 1)
            setStep('navegacion')
            void handleCalcularRutaSiguientePaso(currentStopIdx + 1)
          } else {
            // Finished!
            alert('¡Enhorabuena! Has entregado todas las donaciones con éxito.')
            onFinalizarDonacion()
          }
        }
      } catch {
        // Quietly fail and retry
      }
    }

    const interval = setInterval(() => void checkStopDonations(), 4000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [step, createdDonations, currentStopIdx, stopsToDeliver, vozActiva])

  // Categories extraction
  const categorias = useMemo(() => {
    const set = new Set<string>()
    objetosDonables.forEach((o) => set.add(o.producto.categoria))
    return ['todos', ...Array.from(set).sort()]
  }, [objetosDonables])

  // Filtered objects
  const filteredObjects = useMemo(() => {
    return objetosDonables
      .filter((o) => {
        const matchesSearch = o.producto.nombre.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesCategory = selectedCategory === 'todos' || o.producto.categoria === selectedCategory
        return matchesSearch && matchesCategory
      })
      .sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre))
  }, [objetosDonables, searchTerm, selectedCategory])

  // Route calculation helper for next leg
  const handleCalcularRutaSiguientePaso = async (stopIdx: number) => {
    if (!userPosition) return
    setNavLoading(true)
    try {
      const nextStop = stopsToDeliver[stopIdx]
      const waypoints: [number, number][] = [userPosition, [nextStop.puesto.latitud, nextStop.puesto.longitud]]
      const res = await fetchRutaConPasos(waypoints, 'driving', incidencias)
      const steps = parsearStepsOsrm(res.legs as Parameters<typeof parsearStepsOsrm>[0])
      setStepsNavegacion(steps)
      setStepActualIdx(0)
      announcementsRef.current = new Set()
    } catch {
      // Fallback
    } finally {
      setNavLoading(false)
    }
  }
  const handleEntregarManualPaso = async () => {
    const currentStop = stopsToDeliver[currentStopIdx]
    if (!currentStop) return

    if (!confirm('¿Seguro que deseas marcar todos los productos de esta parada como entregados manualmente?')) {
      return
    }

    setNavLoading(true)
    try {
      const stopDonations = createdDonations.filter((d) => d.puesto.id === currentStop.puesto.id)
      for (const donacion of stopDonations) {
        await queueableApiRequest({ method: 'PATCH', url: `/api/donaciones/${donacion.id}/estado`, data: { estado: 'ENTREGADA' } }, { entity: 'donacion', priority: 'critical' })
      }

      // Update local status of these donations so state is consistent
      setCreatedDonations((current) =>
        current.map((d) =>
          d.puesto.id === currentStop.puesto.id ? { ...d, estado: 'ENTREGADA' } : d
        )
      )

      if (vozActiva && typeof speechSynthesis !== 'undefined') {
        speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance('Entrega confirmada manualmente. Muchas gracias por tu ayuda.')
        utterance.lang = 'es-ES'
        speechSynthesis.speak(utterance)
      }

      if (currentStopIdx < stopsToDeliver.length - 1) {
        // Move to next stop! Compute next leg of the route
        setCurrentStopIdx((prev) => prev + 1)
        setStep('navegacion')
        void handleCalcularRutaSiguientePaso(currentStopIdx + 1)
      } else {
        // Finished!
        alert('¡Enhorabuena! Has entregado todas las donaciones con éxito.')
        onFinalizarDonacion()
      }
    } catch (err) {
      alert('No se pudieron entregar las donaciones manualmente.')
    } finally {
      setNavLoading(false)
    }
  }

  // Trigger allocation & routing
  const handleCalcularPropuestas = async () => {
    setRouteError('')
    if (selectedProductKeys.length === 0) {
      setRouteError('Debes seleccionar al menos un producto.')
      return
    }

    const itemsWithQty = selectedProductKeys.map((key) => {
      const qtyStr = quantities[key] || ''
      const qty = Number(qtyStr.replace(',', '.'))
      const obj = objetosDonables.find((o) => o.key === key)
      return { key, qty, obj }
    })

    const invalid = itemsWithQty.find(({ qty }) => !Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty))
    if (invalid) {
      setRouteError(`Indica una cantidad entera válida mayor que 0 para ${invalid.obj?.producto.nombre}.`)
      return
    }

    if (!userPosition) {
      requestGeo()
      setRouteError('Por favor, activa tu ubicación para calcular las rutas óptimas.')
      return
    }

    setLoadingRoutes(true)
    try {
      // ── Algoritmo de Reparto Inteligente ──────────────────────────────────
      // Copiamos stock disponible del voluntario para cada producto
      const stockVoluntario = Object.fromEntries(
        itemsWithQty.map((item) => [item.obj!.producto.id, item.qty])
      )

      // Agrupamos necesidades de los productos seleccionados por puesto
      const asignaciones: Record<string, AllocationStop> = {}

      selectedProductKeys.forEach((key) => {
        const obj = objetosDonables.find((o) => o.key === key)!
        const prodId = obj.producto.id
        let stockRestante = stockVoluntario[prodId]

        // Ordenamos necesidades del producto: Prioritarias y cercanas primero
        const sortedNecesidades = [...obj.necesidades].sort((a, b) => {
          const priorA = a.prioridad === 'alta' ? 0 : 1
          const priorB = b.prioridad === 'alta' ? 0 : 1
          if (priorA !== priorB) return priorA - priorB

          // Por distancia euclídea al usuario
          const distA = haversineKm(userPosition[0], userPosition[1], a.puesto.latitud, a.puesto.longitud)
          const distB = haversineKm(userPosition[0], userPosition[1], b.puesto.latitud, b.puesto.longitud)
          return distA - distB
        })

        // Repartimos greedily
        for (const necesidad of sortedNecesidades) {
          if (stockRestante <= 0) break

          const pendiente = necesidad.cantidadPendiente ?? 0
          if (pendiente <= 0) continue

          const cantAsignar = Math.min(stockRestante, pendiente)
          if (cantAsignar > 0) {
            stockRestante -= cantAsignar
            if (!asignaciones[necesidad.puesto.id]) {
              asignaciones[necesidad.puesto.id] = { puesto: necesidad.puesto, productos: [] }
            }
            asignaciones[necesidad.puesto.id].productos.push({
              producto: obj.producto,
              cantidad: cantAsignar,
              unidad: obj.producto.unidad,
              necesidad,
            })
          }
        }
      })

      const paradasFinales = Object.values(asignaciones)

      if (paradasFinales.length === 0) {
        throw new Error('Todas las necesidades seleccionadas ya están cubiertas por otros voluntarios.')
      }

      // ── Optimización de Itinerario (TSP) ──────────────────────────────────
      // Ordenamos las paradas para hacer el camino más eficiente (Nearest Neighbor)
      const sortedStops: AllocationStop[] = []
      const unvisited = [...paradasFinales]
      let currentLoc = userPosition

      while (unvisited.length > 0) {
        let bestIdx = 0
        let minDist = Number.POSITIVE_INFINITY

        for (let i = 0; i < unvisited.length; i++) {
          const dist = haversineKm(
            currentLoc[0], currentLoc[1],
            unvisited[i].puesto.latitud, unvisited[i].puesto.longitud
          )
          if (dist < minDist) {
            minDist = dist
            bestIdx = i
          }
        }

        const nextStop = unvisited.splice(bestIdx, 1)[0]
        sortedStops.push(nextStop)
        currentLoc = [nextStop.puesto.latitud, nextStop.puesto.longitud]
      }

      // ── Cálculo del Trazado OSRM evitando calles cortadas ──────────────────
      const waypoints: [number, number][] = [
        userPosition,
        ...sortedStops.map((s) => [s.puesto.latitud, s.puesto.longitud] as [number, number]),
      ]

      const routingRes = await fetchRutaMultiParada(waypoints, incidencias, 'driving')

      setRouteProposals([{
        stops: sortedStops,
        points: routingRes.points,
        distanciaKm: routingRes.distanciaKm,
        duracionMin: routingRes.duracionMin,
        incidenciasEvitadas: routingRes.incidenciasCercanas, // routing.ts evades automatically
        incidenciasCercanas: 0,
      }])
      setSelectedRouteIdx(0)
      setStep('rutas')
    } catch (err) {
      setRouteError(err instanceof Error ? err.message : 'Error al diseñar la ruta.')
    } finally {
      setLoadingRoutes(false)
    }
  }

  // Confirm Route & Commit to Backend
  const handleConfirmarRuta = async () => {
    setRouteError('')
    setLoadingRoutes(true)
    const activeRoute = routeProposals[selectedRouteIdx]
    if (!activeRoute) return

    try {
      const created: Donacion[] = []
      const initDeliveryQtys: Record<string, number> = {}

      for (const stop of activeRoute.stops) {
        for (const prod of stop.productos) {
          const body = {
            puestoId: stop.puesto.id,
            productoId: prod.producto.id,
            cantidad: prod.cantidad,
            unidad: prod.unidad,
            comentario: 'Asignado mediante ruta óptima de voluntario.',
          }

          const clientId = `offline-${crypto.randomUUID()}`
          const entregaCodigo = `OFFLINE-DEL-${clientId}`
          const optimisticDonation: Donacion = {
            id: clientId,
            cantidad: prod.cantidad,
            unidad: prod.unidad,
            estado: 'EN_CAMINO',
            entregaCodigo,
            producto: prod.producto,
            puesto: stop.puesto,
          }
          const { data } = await queueableApiRequest<{ donacion: Donacion }>({
            method: 'POST',
            url: '/api/donaciones',
            data: { ...body, clientId, estadoInicial: 'EN_CAMINO', entregaCodigo },
          }, {
            entity: 'donacion',
            priority: 'high',
            localEntityId: clientId,
            optimisticData: { donacion: optimisticDonation },
          })
          created.push(data.donacion)
          initDeliveryQtys[data.donacion.id] = data.donacion.cantidad
        }
      }

      setCreatedDonations(created)
      setDeliveryQuantities(initDeliveryQtys)
      setStopsToDeliver(activeRoute.stops)
      setCurrentStopIdx(0)

      // Start turn-by-turn navigation for Stop 1
      setNavLoading(true)
      const waypoints: [number, number][] = [
        userPosition!,
        [activeRoute.stops[0].puesto.latitud, activeRoute.stops[0].puesto.longitud],
      ]
      const navRes = await fetchRutaConPasos(waypoints, 'driving', incidencias)
      const steps = parsearStepsOsrm(navRes.legs as Parameters<typeof parsearStepsOsrm>[0])

      setStepsNavegacion(steps)
      setStepActualIdx(0)
      announcementsRef.current = new Set()
      setStep('navegacion')


    } catch (err) {
      setRouteError('Ocurrió un error al registrar las donaciones. Inténtalo de nuevo.')
    } finally {
      setLoadingRoutes(false)
      setNavLoading(false)
    }
  }

  // Navigate actions
  const handleAvanzarStep = () => {
    if (stepActualIdx < stepsNavegacion.length - 1) {
      setStepActualIdx((idx) => idx + 1)
    }
  }

  const handleRetrocederStep = () => {
    if (stepActualIdx > 0) {
      setStepActualIdx((idx) => idx - 1)
    }
  }

  // Toggle products list selection
  const handleToggleProduct = (key: string) => {
    setSelectedProductKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  // Delivery quantities update
  const handleUpdateDeliveryQty = (donacionId: string, delta: number) => {
    setDeliveryQuantities((prev) => {
      const current = prev[donacionId] ?? 0
      const next = Math.max(0.1, current + delta)
      return { ...prev, [donacionId]: Number(next.toFixed(1)) }
    })
  }

  return (
    <div className="space-y-4">
      {routeError && <Notice tone="danger">{routeError}</Notice>}

      {/* ── PASO 1: SELECCIÓN DE PRODUCTOS ── */}
      {step === 'productos' && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">¿Qué producto vas a llevar?</h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* Search Input */}
            <input
              type="text"
              placeholder="Buscar producto a donar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
            {/* Category Dropdown */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="todos">Todas las categorías</option>
              {categorias.filter(c => c !== 'todos').map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {filteredObjects.length === 0 ? (
              <div className="col-span-2 rounded-lg border border-dashed border-slate-300 bg-white/80 p-8 text-center text-sm text-slate-500">
                No hay productos requeridos que coincidan con tu búsqueda.
              </div>
            ) : (
              filteredObjects.map((objeto) => {
                const isSelected = selectedProductKeys.includes(objeto.key)
                return (
                  <button
                    key={objeto.key}
                    type="button"
                    onClick={() => handleToggleProduct(objeto.key)}
                    className={`flex items-start gap-3 rounded-xl border p-4 text-left shadow-sm transition-all ${
                      isSelected
                        ? 'border-cyan-600 bg-cyan-50/30 ring-1 ring-cyan-500'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                      isSelected ? 'border-cyan-700 bg-cyan-700 text-white font-bold' : 'border-slate-300 bg-white text-transparent'
                    }`}>
                      ✓
                    </span>
                    <div className="min-w-0 flex-grow">
                      <p className="font-semibold text-slate-900 leading-tight">
                        {CATEGORIA_EMOJI[objeto.producto.categoria] ?? '📦'} {objeto.producto.nombre}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{objeto.producto.categoria}</p>
                      <p className="mt-1.5 text-[11px] font-semibold text-cyan-700">
                        Hacen falta: {objeto.cantidadTotal} {objeto.producto.unidad} en {objeto.necesidades.length} puesto{objeto.necesidades.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100 bg-white">
            <Button
              type="button"
              variant="secondary"
              onClick={onVolverDashboard}
            >
              Volver
            </Button>
            <Button
              type="button"
              disabled={selectedProductKeys.length === 0}
              onClick={() => setStep('cantidades')}
            >
              Continuar
            </Button>
          </div>
        </div>
      )}

      {/* ── PASO 2: INGRESAR CANTIDADES ── */}
      {step === 'cantidades' && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900">¿Qué cantidad vas a llevar de cada uno?</h2>

          <div className="space-y-3">
            {selectedProductKeys.map((key) => {
              const obj = objetosDonables.find((o) => o.key === key)!
              return (
                <div key={key} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">
                      {CATEGORIA_EMOJI[obj.producto.categoria] ?? '📦'} {obj.producto.nombre}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">Unidad: {obj.producto.unidad}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      placeholder="Cantidad"
                      value={quantities[key] || ''}
                      onChange={(e) => setQuantities({ ...quantities, [key]: e.target.value })}
                      className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm font-semibold focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                    <span className="text-xs font-semibold text-slate-600 w-16 truncate">{obj.producto.unidad}</span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100 bg-white">
            <Button type="button" variant="secondary" onClick={() => setStep('productos')}>
              Atrás
            </Button>
            <Button
              type="button"
              loading={loadingRoutes}
              onClick={() => void handleCalcularPropuestas()}
            >
              Calcular Ruta Óptima
            </Button>
          </div>
        </div>
      )}

      {/* ── PASO 3: PROPUESTAS DE RUTAS OPTIMIZADAS ── */}
      {step === 'rutas' && routeProposals[selectedRouteIdx] && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Esta es la ruta más eficiente</h2>
          {(() => {
            const activeRoute = routeProposals[selectedRouteIdx]
            return (
              <>
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Ruta Recomendada (TSP Optimizada)</p>
                        <p className="mt-1 text-xs text-slate-600">
                          {activeRoute.stops.length} parada{activeRoute.stops.length === 1 ? '' : 's'} · {activeRoute.distanciaKm.toFixed(1)} km · ~{activeRoute.duracionMin} min
                        </p>
                      </div>
                      <Badge variant="success">Óptimo</Badge>
                    </div>
                  </div>
                  
                  {/* Map Rendering */}
                  <Map
                    className="h-80"
                    center={[
                      activeRoute.stops[0]?.puesto.latitud ?? 39.4254,
                      activeRoute.stops[0]?.puesto.longitud ?? -0.4178,
                    ]}
                    userPosition={userPosition}
                    onUserLocated={setUserPosition}
                    puestos={activeRoute.stops.map((stop) => ({
                      id: stop.puesto.id,
                      nombre: stop.puesto.nombre,
                      direccion: stop.puesto.direccion,
                      latitud: stop.puesto.latitud,
                      longitud: stop.puesto.longitud,
                      necesidades: stop.productos.length,
                    }))}
                    incidencias={incidencias}
                    route={activeRoute.points}
                    markerVariant="neutral"
                  />
                  <RouteSafetyPanel
                    distanciaKm={activeRoute.distanciaKm}
                    duracionMin={activeRoute.duracionMin}
                    incidenciasEvitadas={activeRoute.incidenciasEvitadas}
                    incidenciasCercanas={activeRoute.incidenciasCercanas}
                    destino={activeRoute.stops.map((s) => s.puesto.nombre).join(', ')}
                  />
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-900">Itinerario y asignación de carga:</p>
                  
                  {activeRoute.stops.map((stop, sIdx) => (
                    <div key={stop.puesto.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                      <div className="flex items-start gap-3">
                        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-cyan-700 text-xs font-bold text-white leading-none">
                          {sIdx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-900">{stop.puesto.nombre}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{stop.puesto.direccion}</p>
                          
                          <div className="mt-3 space-y-1.5">
                            {stop.productos.map((prod) => (
                              <div key={prod.producto.id} className="flex items-center justify-between text-xs rounded-lg bg-slate-50 px-2.5 py-1.5">
                                <span className="font-medium text-slate-700">
                                  {CATEGORIA_EMOJI[prod.producto.categoria] ?? '📦'} {prod.producto.nombre}
                                </span>
                                <span className="font-semibold text-slate-900 bg-white px-2 py-0.5 rounded shadow-2xs border border-slate-100">
                                  {prod.cantidad} {prod.unidad}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100 bg-white">
                  <Button type="button" variant="secondary" onClick={() => setStep('cantidades')}>
                    Atrás
                  </Button>
                  <Button
                    type="button"
                    loading={loadingRoutes}
                    onClick={() => void handleConfirmarRuta()}
                  >
                    Iniciar Ruta e Indicaciones
                  </Button>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* ── PASO 4: NAVEGACIÓN ACTIVA (INDICACIONES POR VOZ Y DIRECCIÓN) ── */}
      {step === 'navegacion' && stopsToDeliver[currentStopIdx] && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Indicaciones para llegar</h2>
          {(() => {
            const currentStop = stopsToDeliver[currentStopIdx]
            const stepObj = stepsNavegacion[stepActualIdx]
            const nextStepObj = stepsNavegacion[stepActualIdx + 1]
            const esUltimo = stepActualIdx === stepsNavegacion.length - 1
            const distanciaM = userPosition && stepObj
              ? Math.round(distanciaAlStep(userPosition[0], userPosition[1], stepObj))
              : null

            const bearingAbsoluto = userPosition && stepObj && !esUltimo
              ? calcularBearing(userPosition[0], userPosition[1], stepObj.lat, stepObj.lng)
              : null

            const brujulaDisponible = headingDispositivo !== null && bearingAbsoluto !== null
            const rotacion = brujulaDisponible
              ? (bearingAbsoluto! - headingDispositivo! + 360) % 360
              : stepObj ? ROTACION_ICONO[stepObj.icono] : 0

            return (
              <>
                <div className="rounded-xl bg-slate-900 text-white p-4 shadow-xl">
                  {/* Top info */}
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                      PARADA {currentStopIdx + 1} de {stopsToDeliver.length} · {currentStop.puesto.nombre}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setVozActiva((v) => !v)}
                        className={`rounded-full p-1.5 text-xs transition-colors ${vozActiva ? 'bg-cyan-600/30 text-cyan-400' : 'bg-white/10 text-white/50'}`}
                      >
                        {vozActiva ? '🔊 Voz On' : '🔇 Mudo'}
                      </button>
                    </div>
                  </div>

                  {navLoading ? (
                    <div className="flex justify-center items-center h-40">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
                    </div>
                  ) : stepObj ? (
                    <div className="py-4 space-y-4">
                      {/* Guidance Compass and text */}
                      <div className="flex items-center gap-4">
                        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-white/10 border border-white/20">
                          <FlechaNavegacion icono={stepObj.icono} rotacion={rotacion} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-lg font-bold leading-tight">{stepObj.instruccion}</p>
                          {stepObj.calle && stepObj.tipo !== 'depart' && stepObj.tipo !== 'arrive' && (
                            <p className="text-xs text-white/60 mt-0.5 truncate">{stepObj.calle}</p>
                          )}
                          {distanciaM !== null && !esUltimo && (
                            <p className="text-xl font-extrabold text-cyan-400 mt-1 tabular-nums">
                              {formatearDistanciaNav(distanciaM)}
                            </p>
                          )}
                        </div>
                      </div>

                      {nextStepObj && (
                        <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs flex items-center gap-2 text-white/80">
                          <span className="font-semibold text-cyan-400 whitespace-nowrap">A continuación:</span>
                          <span className="truncate flex-1">{nextStepObj.instruccion}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-white/60 text-sm">
                      Preparando guía paso a paso...
                    </div>
                  )}

                  {/* Navigation steps controls */}
                  <div className="flex gap-2 border-t border-white/10 pt-3">
                    <button
                      type="button"
                      onClick={handleRetrocederStep}
                      disabled={stepActualIdx === 0}
                      className="flex-1 rounded-lg border border-white/20 py-2 text-xs font-semibold hover:bg-white/5 disabled:opacity-30 transition-colors"
                    >
                      ← Anterior
                    </button>
                    <button
                      type="button"
                      onClick={handleAvanzarStep}
                      disabled={esUltimo}
                      className="flex-1 rounded-lg bg-cyan-600 py-2 text-xs font-semibold hover:bg-cyan-500 disabled:opacity-30 transition-colors"
                    >
                      Siguiente →
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                  <Map
                    className="h-80"
                    center={[currentStop.puesto.latitud, currentStop.puesto.longitud]}
                    userPosition={userPosition}
                    onUserLocated={setUserPosition}
                    puestos={[{
                      id: currentStop.puesto.id,
                      nombre: currentStop.puesto.nombre,
                      direccion: currentStop.puesto.direccion,
                      latitud: currentStop.puesto.latitud,
                      longitud: currentStop.puesto.longitud,
                      necesidades: 0,
                    }]}
                    incidencias={incidencias}
                    route={stepsNavegacion.map(s => [s.lat, s.lng] as [number, number])}
                    markerVariant="neutral"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <Button
                    type="button"
                    fullWidth
                    onClick={() => {
                      setStep('entregas-qr')
                      if (vozActiva && typeof speechSynthesis !== 'undefined') {
                        speechSynthesis.cancel()
                        const utterance = new SpeechSynthesisUtterance('Llegada al puesto. Por favor, muestra el código QR de entrega.')
                        utterance.lang = 'es-ES'
                        speechSynthesis.speak(utterance)
                      }
                    }}
                  >
                    He llegado al Puesto
                  </Button>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* ── PASO 5: CÓDIGO QR DE ENTREGA Y CONFIRMACIÓN AJUSTABLE ── */}
      {step === 'entregas-qr' && stopsToDeliver[currentStopIdx] && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Enseña este código QR al responsable del puesto</h2>
          {(() => {
            const currentStop = stopsToDeliver[currentStopIdx]
            const stopDonations = createdDonations.filter((d) => d.puesto.id === currentStop.puesto.id)

            return (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
                  <div className="text-center sm:text-left">
                    <p className="text-sm font-semibold uppercase tracking-wider text-cyan-700">
                      Entregando en: {currentStop.puesto.nombre}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {currentStop.puesto.direccion}
                    </p>
                  </div>

                  {/* QR Display */}
                  <div className="flex flex-col items-center justify-center gap-4 py-4 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="space-y-3 text-center">
                      <p className="text-xs font-semibold text-slate-500">ESCANEADO DEL PUESTO</p>
                      <p className="text-xs text-slate-400">Escanea los QR de cada producto por separado:</p>
                    </div>

                    <div className="w-full max-w-sm space-y-4 px-2">
                      {stopDonations.map((donacion) => {
                        const qty = deliveryQuantities[donacion.id] ?? donacion.cantidad
                        const qrPayload = createCodigoEntregaPayload(donacion, donacion.entregaCodigo!, qty)

                        return (
                          <div key={donacion.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs space-y-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-bold text-slate-900 text-sm">
                                  {CATEGORIA_EMOJI[donacion.producto.categoria] ?? '📦'} {donacion.producto.nombre}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">Estado: {donacion.estado}</p>
                              </div>
                              <Badge variant={donacion.estado === 'ENTREGADA' ? 'success' : 'warning'}>
                                {donacion.estado}
                              </Badge>
                            </div>

                            {donacion.estado !== 'ENTREGADA' && (
                              <>
                                <div className="flex items-center justify-center rounded-lg border border-slate-100 bg-slate-50 p-2 shadow-inner">
                                  <ReadableQrCode value={qrPayload} />
                                </div>

                                {/* Ajuste rápido de cantidad */}
                                <div className="rounded-lg bg-cyan-50/30 border border-cyan-100/50 p-2.5 flex items-center justify-between">
                                  <div className="text-xs text-cyan-900 leading-tight">
                                    <p className="font-semibold">¿Llevas otra cantidad?</p>
                                    <p className="text-[10px] text-slate-400">Ajústala y el QR cambiará al instante.</p>
                                  </div>
                                  <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        handleUpdateDeliveryQty(donacion.id, -1)
                                      }}
                                      className="h-7 w-7 rounded bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 text-xs flex items-center justify-center"
                                    >
                                      -
                                    </button>
                                    <span className="px-2 font-bold text-slate-900 text-xs text-center w-12 truncate">
                                      {qty}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        handleUpdateDeliveryQty(donacion.id, 1)
                                      }}
                                      className="h-7 w-7 rounded bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 text-xs flex items-center justify-center"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <Notice tone="info">
                    Esperando confirmación del puesto. La pantalla avanzará automáticamente una vez escaneado y confirmado.
                  </Notice>
                </div>

                {/* Manual Delivery Override Button inside Wizard */}
                <Button
                  type="button"
                  variant="primary"
                  fullWidth
                  loading={navLoading}
                  className="py-3 font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 border-0 shadow-sm mt-3"
                  onClick={handleEntregarManualPaso}
                >
                  ✔️ Ya he entregado el producto
                </Button>

                <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100 bg-white">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setStep('navegacion')
                      void handleCalcularRutaSiguientePaso(currentStopIdx)
                    }}
                  >
                    Atrás a Navegación
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => {
                      if (confirm('¿Seguro que quieres cancelar este reparto de donaciones?')) {
                        onFinalizarDonacion()
                      }
                    }}
                  >
                    Cancelar Reparto
                  </Button>
                </div>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
