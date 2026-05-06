import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useGeolocation } from '@/hooks/useGeolocation'
import { apiClient } from '@/lib/api/client'
import { useAuthStore } from '@/store/auth.store'
import Button from '@/components/ui/Button'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface SolicitudPuesto {
  id: string
  nombre: string
  tipo: string
  direccion: string
  activo: boolean
  estadoSolicitud: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO'
  motivoRechazo: string | null
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
  { value: 'colegio',       label: 'Colegio / Instituto' },
  { value: 'pabellon',      label: 'Pabellón deportivo / Polideportivo' },
  { value: 'centro_civico', label: 'Centro cívico / Cultural' },
  { value: 'iglesia',       label: 'Iglesia / Parroquia' },
  { value: 'almacen',       label: 'Almacén / Nave industrial' },
  { value: 'hotel',         label: 'Hotel / Albergue' },
  { value: 'ayuntamiento',  label: 'Ayuntamiento / Edificio municipal' },
  { value: 'otro',          label: 'Otro' },
]

const INITIAL_FORM: PuestoForm = {
  nombrePuesto: '', tipo: '', direccion: '', descripcion: '', latitud: '', longitud: '',
}

// ── Validación ─────────────────────────────────────────────────────────────────

function validate(f: PuestoForm): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!f.nombrePuesto.trim()) errors.nombrePuesto = 'El nombre del puesto es obligatorio'
  if (!f.tipo)                errors.tipo = 'Selecciona el tipo de instalación'
  if (!f.direccion.trim())    errors.direccion = 'La dirección es obligatoria'
  const lat = parseFloat(f.latitud)
  const lng = parseFloat(f.longitud)
  if (!f.latitud || isNaN(lat) || lat < -90 || lat > 90)
    errors.latitud = 'Latitud inválida (entre -90 y 90)'
  if (!f.longitud || isNaN(lng) || lng < -180 || lng > 180)
    errors.longitud = 'Longitud inválida (entre -180 y 180)'
  return errors
}

// ── Subcomponentes ─────────────────────────────────────────────────────────────

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className="mt-1 text-xs text-red-600">{msg}</p>
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
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

// ── Pantalla de estado ─────────────────────────────────────────────────────────

function EstadoPendiente({ puesto, onVolver }: { puesto: SolicitudPuesto; onVolver: () => void }) {
  return (
    <div className="min-h-screen bg-amber-50 flex flex-col justify-center px-4">
      <div className="max-w-sm mx-auto w-full text-center">
        <div className="text-5xl mb-4">⏳</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">En espera de aprobación</h1>
        <p className="text-sm text-gray-500 mb-6">
          Tu solicitud para <strong>{puesto.nombre}</strong> está siendo revisada por el coordinador. Te activaremos el acceso en cuanto sea aprobada.
        </p>
        <div className="bg-white border border-amber-200 rounded-xl px-4 py-3 text-xs text-gray-500 text-left space-y-1 mb-6">
          <p><span className="font-medium">Puesto:</span> {puesto.nombre}</p>
          <p><span className="font-medium">Dirección:</span> {puesto.direccion}</p>
          <p><span className="font-medium">Enviada:</span> {new Date(puesto.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
        </div>
        <button onClick={onVolver} className="text-sm text-amber-700 hover:text-amber-900 underline">
          ← Volver
        </button>
      </div>
    </div>
  )
}

function EstadoRechazado({ puesto, onNuevaSolicitud, onVolver }: { puesto: SolicitudPuesto; onNuevaSolicitud: () => void; onVolver: () => void }) {
  return (
    <div className="min-h-screen bg-red-50 flex flex-col justify-center px-4">
      <div className="max-w-sm mx-auto w-full">
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Solicitud rechazada</h1>
          <p className="text-sm text-gray-500">
            Tu solicitud para <strong>{puesto.nombre}</strong> ha sido rechazada por el coordinador.
          </p>
        </div>

        {puesto.motivoRechazo && (
          <div className="bg-white border border-red-200 rounded-xl px-4 py-3 mb-6">
            <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-1">Motivo del rechazo</p>
            <p className="text-sm text-gray-700">{puesto.motivoRechazo}</p>
          </div>
        )}

        <div className="space-y-3">
          <Button
            fullWidth
            onClick={onNuevaSolicitud}
            className="bg-amber-500 hover:bg-amber-600 focus-visible:ring-amber-500"
          >
            Enviar nueva solicitud
          </Button>
          <button onClick={onVolver} className="w-full text-sm text-gray-400 hover:text-gray-600">
            ← Volver
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Formulario del puesto ─────────────────────────────────────────────────────

function FormularioPuesto({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState<PuestoForm>(INITIAL_FORM)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState('')
  const [loading, setLoading] = useState(false)

  const { position, loading: geoLoading, request: requestGeo } = useGeolocation()

  if (position && form.latitud !== position.lat.toFixed(6)) {
    setForm((prev) => ({
      ...prev,
      latitud: position.lat.toFixed(6),
      longitud: position.lng.toFixed(6),
    }))
  }

  const set = (field: keyof PuestoForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
      setErrors((prev) => ({ ...prev, [field]: '' }))
    }

  const handleUseMyLocation = () => {
    requestGeo()
    if (position) {
      setForm((prev) => ({
        ...prev,
        latitud: position.lat.toFixed(6),
        longitud: position.lng.toFixed(6),
      }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setLoading(true)
    setSubmitError('')

    try {
      await apiClient.post('/api/puestos/solicitar', {
        nombre: form.nombrePuesto,
        tipo: form.tipo,
        direccion: form.direccion,
        descripcion: form.descripcion || undefined,
        latitud: parseFloat(form.latitud),
        longitud: parseFloat(form.longitud),
      })
      onSuccess()
    } catch (err: unknown) {
      const response = (err as { response?: { data?: { error?: string } } })?.response
      setSubmitError(response?.data?.error ?? 'Error al enviar la solicitud. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
      <div>
        <Label required>Nombre del puesto</Label>
        <Input value={form.nombrePuesto} onChange={set('nombrePuesto')} error={errors.nombrePuesto} placeholder="Ej: CEIP La Paz, Pabellón Municipal Norte..." />
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
        <Label required>Dirección completa</Label>
        <Input value={form.direccion} onChange={set('direccion')} error={errors.direccion} placeholder="Calle Mayor 12, Paiporta, Valencia" />
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

        <Button type="button" variant="secondary" fullWidth loading={geoLoading} onClick={handleUseMyLocation} className="mb-3">
          📍 {geoLoading ? 'Obteniendo ubicación...' : 'Usar mi ubicación actual'}
        </Button>

        {form.latitud && form.longitud && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700 mb-3 flex items-center gap-2">
            <span>✓</span>
            <span>Ubicación capturada: {parseFloat(form.latitud).toFixed(4)}, {parseFloat(form.longitud).toFixed(4)}</span>
          </div>
        )}

        <p className="text-xs text-gray-400 text-center mb-2">o introduce las coordenadas manualmente</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label required>Latitud</Label>
            <Input type="number" step="0.000001" value={form.latitud} onChange={set('latitud')} error={errors.latitud} placeholder="39.4254" />
          </div>
          <div>
            <Label required>Longitud</Label>
            <Input type="number" step="0.000001" value={form.longitud} onChange={set('longitud')} error={errors.longitud} placeholder="-0.4178" />
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          Puedes obtener las coordenadas abriendo Google Maps, pulsando sobre el edificio y copiando los números que aparecen.
        </p>
      </div>

      {submitError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
          {submitError}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
        <strong>Pendiente de aprobación:</strong> Tu solicitud será revisada por un coordinador. Recibirás acceso al puesto cuando sea aprobada.
      </div>

      <Button type="submit" fullWidth loading={loading} className="bg-amber-500 hover:bg-amber-600 focus-visible:ring-amber-500">
        Enviar solicitud
      </Button>
    </form>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function RegisterPuesto() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const [mostrarFormulario, setMostrarFormulario] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/auth/login', { replace: true })
    }
  }, [isAuthenticated, navigate])

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['mi-solicitud-puesto'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ puesto: SolicitudPuesto | null }>('/api/puestos/mi-solicitud')
      return data.puesto
    },
    enabled: isAuthenticated,
  })

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

  // Aprobado → redirigir al dashboard del puesto
  if (solicitud?.estadoSolicitud === 'APROBADO') {
    navigate('/puesto', { replace: true })
    return null
  }

  // Pendiente → mostrar estado de espera
  if (solicitud?.estadoSolicitud === 'PENDIENTE') {
    return <EstadoPendiente puesto={solicitud} onVolver={onVolver} />
  }

  // Rechazado → mostrar motivo y opción de nueva solicitud
  if (solicitud?.estadoSolicitud === 'RECHAZADO' && !mostrarFormulario) {
    return (
      <EstadoRechazado
        puesto={solicitud}
        onNuevaSolicitud={() => setMostrarFormulario(true)}
        onVolver={onVolver}
      />
    )
  }

  // Sin solicitud o nueva solicitud tras rechazo → mostrar formulario
  return (
    <div className="min-h-screen bg-amber-50">
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => mostrarFormulario ? setMostrarFormulario(false) : onVolver()}
            className="text-sm text-amber-700 hover:text-amber-900 flex items-center gap-1 mb-4"
          >
            ← Volver
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
