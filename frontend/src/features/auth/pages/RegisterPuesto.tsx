import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useGeolocation } from '@/hooks/useGeolocation'
import { apiClient } from '@/lib/api/client'
import { queueableApiRequest } from '@/lib/api/offline'
import { useAuthStore } from '@/store/auth.store'
import Button from '@/components/ui/Button'
import Map from '@/components/shared/Map'
import { getApiErrorMessage } from '@/utils/errors'

interface SolicitudPuesto {
  id: string
  nombre: string
  tipo: string
  direccion: string
  descripcion?: string | null
  latitud: number
  longitud: number
  estado: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA'
  motivoRechazo?: string | null
  createdAt: string
}

interface PuestoForm {
  nombrePuesto: string
  tipo: string
  direccion: string
  descripcion: string
  latitud: string
  longitud: string
}

const TIPOS_INSTALACION = [
  { value: 'colegio', label: 'Colegio / Instituto' },
  { value: 'pabellon', label: 'Pabellon deportivo / Polideportivo' },
  { value: 'centro_civico', label: 'Centro civico / Cultural' },
  { value: 'iglesia', label: 'Iglesia / Parroquia' },
  { value: 'almacen', label: 'Almacen / Nave industrial' },
  { value: 'hotel', label: 'Hotel / Albergue' },
  { value: 'ayuntamiento', label: 'Ayuntamiento / Edificio municipal' },
  { value: 'otro', label: 'Otro' },
]

const INITIAL_FORM: PuestoForm = {
  nombrePuesto: '',
  tipo: '',
  direccion: '',
  descripcion: '',
  latitud: '',
  longitud: '',
}

function validate(f: PuestoForm): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!f.nombrePuesto.trim()) errors.nombrePuesto = 'El nombre del puesto es obligatorio'
  if (!f.tipo) errors.tipo = 'Selecciona el tipo de instalación'
  if (!f.direccion.trim()) errors.direccion = 'La dirección es obligatoria'

  const lat = Number.parseFloat(f.latitud)
  const lng = Number.parseFloat(f.longitud)
  if (!f.latitud || Number.isNaN(lat) || lat < -90 || lat > 90) {
    errors.ubicacion = 'Busca la dirección o selecciona el punto en el mapa'
  }
  if (!f.longitud || Number.isNaN(lng) || lng < -180 || lng > 180) {
    errors.ubicacion = 'Busca la dirección o selecciona el punto en el mapa'
  }

  return errors
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className="mt-1 text-xs text-red-600">{msg}</p>
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  const { error, className, ...rest } = props
  return (
    <>
      <input
        className={`w-full rounded-lg border text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 ${
          error ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'
        } ${className ?? ''}`}
        {...rest}
      />
      <FieldError msg={error} />
    </>
  )
}

function EstadoPendiente({ solicitud, onVolver }: { solicitud: SolicitudPuesto; onVolver: () => void }) {
  return (
    <div className="min-h-screen bg-amber-50 flex flex-col justify-center px-4">
      <div className="max-w-sm mx-auto w-full text-center">
        <div className="text-5xl mb-4">...</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">En espera de aprobación</h1>
        <p className="text-sm text-gray-500 mb-6">
          Tu solicitud para <strong>{solicitud.nombre}</strong> está siendo revisada por el coordinador.
        </p>
        <div className="bg-white border border-amber-200 rounded-xl px-4 py-3 text-xs text-gray-500 text-left space-y-1 mb-6">
          <p><span className="font-medium">Puesto:</span> {solicitud.nombre}</p>
          <p><span className="font-medium">Dirección:</span> {solicitud.direccion}</p>
          <p><span className="font-medium">Enviada:</span> {new Date(solicitud.createdAt).toLocaleDateString('es-ES')}</p>
        </div>
        <button onClick={onVolver} className="text-sm text-amber-700 hover:text-amber-900 underline">
          Volver
        </button>
      </div>
    </div>
  )
}

function EstadoRechazado({
  solicitud,
  onNuevaSolicitud,
  onVolver,
}: {
  solicitud: SolicitudPuesto
  onNuevaSolicitud: () => void
  onVolver: () => void
}) {
  return (
    <div className="min-h-screen bg-red-50 flex flex-col justify-center px-4">
      <div className="max-w-sm mx-auto w-full">
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">!</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Solicitud rechazada</h1>
          <p className="text-sm text-gray-500">
            Tu solicitud para <strong>{solicitud.nombre}</strong> ha sido rechazada por el coordinador.
          </p>
        </div>

        {solicitud.motivoRechazo && (
          <div className="bg-white border border-red-200 rounded-xl px-4 py-3 mb-6">
            <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-1">Motivo del rechazo</p>
            <p className="text-sm text-gray-700">{solicitud.motivoRechazo}</p>
          </div>
        )}

        <div className="space-y-3">
          <Button fullWidth onClick={onNuevaSolicitud} className="bg-amber-500 hover:bg-amber-600 focus-visible:ring-amber-500">
            Enviar nueva solicitud
          </Button>
          <button onClick={onVolver} className="w-full text-sm text-gray-400 hover:text-gray-600">
            Volver
          </button>
        </div>
      </div>
    </div>
  )
}

function FormularioPuesto({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState<PuestoForm>(INITIAL_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState('')
  const [loading, setLoading] = useState(false)
  const { position, loading: geoLoading, request: requestGeo } = useGeolocation()
  const [selectCurrentWhenReady, setSelectCurrentWhenReady] = useState(false)
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [mapCenter, setMapCenter] = useState<[number, number]>([39.425, -0.4])
  const currentLat = position?.lat
  const currentLng = position?.lng

  const selectedPosition: [number, number] | null = form.latitud && form.longitud
    ? [Number.parseFloat(form.latitud), Number.parseFloat(form.longitud)]
    : null

  const applySelectedLocation = useCallback(async ([lat, lng]: [number, number], recenter = false) => {
    setForm((prev) => ({
      ...prev,
      direccion: '',
      latitud: lat.toFixed(6),
      longitud: lng.toFixed(6),
    }))
    if (recenter) setMapCenter([lat, lng])
    setErrors((prev) => ({ ...prev, direccion: '', ubicacion: '' }))
    setLocationLoading(true)
    setLocationError('')

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18`,
        { headers: { Accept: 'application/json', 'Accept-Language': 'es' } },
      )
      if (!response.ok) throw new Error('reverse-failed')
      const result = await response.json() as { display_name?: string }
      if (!result.display_name) throw new Error('address-not-found')
      setForm((prev) => ({ ...prev, direccion: result.display_name ?? '' }))
    } catch {
      setLocationError('No se ha podido obtener la calle. Puedes escribirla manualmente sin perder el punto seleccionado.')
    } finally {
      setLocationLoading(false)
    }
  }, [])

  useEffect(() => {
    if (currentLat === undefined || currentLng === undefined) {
      requestGeo()
      return
    }
    if (selectCurrentWhenReady) {
      setSelectCurrentWhenReady(false)
      void applySelectedLocation([currentLat, currentLng], true)
      return
    }
    setMapCenter((current) => current[0] === currentLat && current[1] === currentLng
      ? current
      : [currentLat, currentLng])
  }, [applySelectedLocation, currentLat, currentLng, requestGeo, selectCurrentWhenReady])

  const set = (field: keyof PuestoForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
      setErrors((prev) => ({ ...prev, [field]: '' }))
    }

  const handleUseMyLocation = () => {
    if (position) {
      void applySelectedLocation([position.lat, position.lng], true)
    } else {
      setSelectCurrentWhenReady(true)
      requestGeo()
    }
  }

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({
      ...prev,
      direccion: e.target.value,
      latitud: '',
      longitud: '',
    }))
    setErrors((prev) => ({ ...prev, direccion: '', ubicacion: '' }))
    setLocationError('')
  }

  const searchAddress = async () => {
    const query = form.direccion.trim()
    if (!query) {
      setErrors((prev) => ({ ...prev, direccion: 'Escribe una calle o dirección' }))
      return
    }

    setLocationLoading(true)
    setLocationError('')
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=es&q=${encodeURIComponent(query)}`,
        { headers: { Accept: 'application/json', 'Accept-Language': 'es' } },
      )
      if (!response.ok) throw new Error('search-failed')
      const results = await response.json() as Array<{ lat: string; lon: string; display_name: string }>
      const result = results[0]
      if (!result) {
        setLocationError('No hemos encontrado esa dirección. Añade el municipio o el código postal.')
        return
      }
      const lat = Number.parseFloat(result.lat)
      const lng = Number.parseFloat(result.lon)
      setForm((prev) => ({
        ...prev,
        direccion: result.display_name,
        latitud: lat.toFixed(6),
        longitud: lng.toFixed(6),
      }))
      setMapCenter([lat, lng])
      setErrors((prev) => ({ ...prev, direccion: '', ubicacion: '' }))
    } catch {
      setLocationError('No se ha podido buscar la dirección. Comprueba tu conexión e inténtalo de nuevo.')
    } finally {
      setLocationLoading(false)
    }
  }

  const selectMapPoint = (point: [number, number]) => void applySelectedLocation(point)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    setLoading(true)
    setSubmitError('')

    try {
      await queueableApiRequest({ method: 'POST', url: '/api/puestos/solicitudes', data: {
        nombre: form.nombrePuesto.trim(),
        tipo: form.tipo,
        direccion: form.direccion.trim(),
        descripcion: form.descripcion.trim() || undefined,
        latitud: Number.parseFloat(form.latitud),
        longitud: Number.parseFloat(form.longitud),
      } }, { entity: 'solicitud-puesto', priority: 'high' })
      onSuccess()
    } catch (err: unknown) {
      setSubmitError(getApiErrorMessage(err, 'Error al enviar la solicitud. Inténtalo de nuevo.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
      <div>
        <Label required>Nombre del puesto</Label>
        <Input value={form.nombrePuesto} onChange={set('nombrePuesto')} error={errors.nombrePuesto} placeholder="Ej: CEIP La Paz, Pabellon Municipal Norte..." />
      </div>

      <div>
        <Label required>Tipo de instalación</Label>
        <select
          value={form.tipo}
          onChange={set('tipo')}
          className={`w-full rounded-lg border text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 ${
            errors.tipo ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'
          }`}
        >
          <option value="">Selecciona el tipo...</option>
          {TIPOS_INSTALACION.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <FieldError msg={errors.tipo} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Descripción <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <textarea
          value={form.descripcion}
          onChange={set('descripcion')}
          rows={2}
          placeholder="Horario de apertura, capacidad, notas importantes..."
          className="w-full rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none"
        />
      </div>

      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm font-medium text-gray-700 mb-3">
          Ubicación del puesto <span className="text-red-500">*</span>
        </p>
        <div className="space-y-3">
          <div>
            <Label required>Calle o dirección</Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input value={form.direccion} onChange={handleAddressChange} error={errors.direccion} placeholder="Calle Mayor 12, Paiporta" />
              </div>
              <Button type="button" variant="secondary" loading={locationLoading} onClick={searchAddress}>
                Buscar dirección
              </Button>
            </div>
          </div>

          <p className="text-xs text-gray-500">También puedes pulsar sobre el mapa para marcar la entrada del puesto.</p>
          <Map
            key={`${mapCenter[0]}-${mapCenter[1]}`}
            center={mapCenter}
            zoom={16}
            userPosition={position ? [position.lat, position.lng] : null}
            reportPoint={selectedPosition}
            reportPointKind="emergency-post"
            selectingReportPoint
            onReportPointSelect={selectMapPoint}
            className="h-64 rounded-xl overflow-hidden border border-gray-200"
          />
          <Button type="button" variant="secondary" fullWidth loading={geoLoading} onClick={handleUseMyLocation}>
            {geoLoading ? 'Obteniendo ubicación...' : 'Usar mi ubicación actual'}
          </Button>
        </div>

        {locationLoading && <p className="text-xs text-gray-500">Completando la ubicación...</p>}
        {locationError && <p className="text-xs text-red-600">{locationError}</p>}
        <FieldError msg={errors.ubicacion} />
        {selectedPosition && !errors.ubicacion && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700 mt-3">
            Ubicación seleccionada correctamente
          </div>
        )}
      </div>

      {submitError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
          {submitError}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
        <strong>Pendiente de aprobación:</strong> Tu solicitud será revisada por un coordinador. El puesto se activará cuando sea aceptada.
      </div>

      <Button type="submit" fullWidth loading={loading} className="bg-amber-500 hover:bg-amber-600 focus-visible:ring-amber-500">
        Enviar solicitud
      </Button>
    </form>
  )
}

export default function RegisterPuesto() {
  const navigate = useNavigate()
  const { isAuthenticated, setPuestoId, updateUser, user } = useAuthStore()
  const [mostrarFormulario, setMostrarFormulario] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) navigate('/auth/login?role=puesto', { replace: true })
  }, [isAuthenticated, navigate])

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['mi-solicitud-puesto'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ solicitud: SolicitudPuesto | null }>('/api/puestos/solicitudes/mia')
      return data.solicitud
    },
    enabled: isAuthenticated,
  })

  useEffect(() => {
    if (data?.estado !== 'ACEPTADA') return

    let cancelled = false

    apiClient.get<{ puestos: { id: string }[] }>('/api/puestos/mio')
      .then((response) => {
        if (cancelled) return
        const puestoId = response.data.puestos?.[0]?.id ?? null
        setPuestoId(puestoId)
        if (user && !user.roles.includes('PUESTO_EMERGENCIA')) {
          updateUser({ roles: [...user.roles, 'PUESTO_EMERGENCIA'] })
        }
        navigate(puestoId ? '/puesto' : '/seleccionar-rol', { replace: true })
      })
      .catch(() => {
        if (!cancelled) navigate('/seleccionar-rol', { replace: true })
      })

    return () => {
      cancelled = true
    }
  }, [data?.estado, navigate, setPuestoId, updateUser, user])

  if (!isAuthenticated) return null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    )
  }

  const solicitud = data ?? null
  const onVolver = () => navigate('/seleccionar-rol')

  if (solicitud?.estado === 'ACEPTADA') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    )
  }

  if (solicitud?.estado === 'PENDIENTE') {
    return <EstadoPendiente solicitud={solicitud} onVolver={onVolver} />
  }

  if (solicitud?.estado === 'RECHAZADA' && !mostrarFormulario) {
    return (
      <EstadoRechazado
        solicitud={solicitud}
        onNuevaSolicitud={() => setMostrarFormulario(true)}
        onVolver={onVolver}
      />
    )
  }

  return (
    <div className="min-h-screen bg-amber-50">
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => (mostrarFormulario ? setMostrarFormulario(false) : onVolver())}
            className="text-sm text-amber-700 hover:text-amber-900 flex items-center gap-1 mb-4"
          >
            Volver
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Registrar puesto de emergencia</h1>
          <p className="text-sm text-gray-500 mt-1">Tu solicitud será verificada antes de activarse.</p>
        </div>

        <FormularioPuesto
          onSuccess={() => {
            setMostrarFormulario(false)
            refetch()
          }}
        />
      </div>
    </div>
  )
}
