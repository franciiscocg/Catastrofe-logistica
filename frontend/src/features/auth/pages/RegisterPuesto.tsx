import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useGeolocation } from '@/hooks/useGeolocation'
import { apiClient } from '@/lib/api/client'
import { useAuthStore } from '@/store/auth.store'
import Button from '@/components/ui/Button'

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2

interface FormData {
  // Cuenta
  nombre: string
  apellidos: string
  email: string
  telefono: string
  dni: string
  password: string
  passwordConfirm: string
  // Puesto
  nombrePuesto: string
  tipo: string
  direccion: string
  descripcion: string
  latitud: string
  longitud: string
}

const TIPOS_INSTALACION = [
  { value: 'colegio',     label: 'Colegio / Instituto' },
  { value: 'pabellon',    label: 'Pabellón deportivo / Polideportivo' },
  { value: 'centro_civico', label: 'Centro cívico / Cultural' },
  { value: 'iglesia',     label: 'Iglesia / Parroquia' },
  { value: 'almacen',     label: 'Almacén / Nave industrial' },
  { value: 'hotel',       label: 'Hotel / Albergue' },
  { value: 'ayuntamiento', label: 'Ayuntamiento / Edificio municipal' },
  { value: 'otro',        label: 'Otro' },
]

const INITIAL: FormData = {
  nombre: '', apellidos: '', email: '', telefono: '', dni: '',
  password: '', passwordConfirm: '',
  nombrePuesto: '', tipo: '', direccion: '', descripcion: '',
  latitud: '', longitud: '',
}

// ── Validación ─────────────────────────────────────────────────────────────────

function validateStep1(f: FormData): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!f.nombre.trim())        errors.nombre = 'El nombre es obligatorio'
  if (!f.apellidos.trim())     errors.apellidos = 'Los apellidos son obligatorios'
  if (!f.email.includes('@'))  errors.email = 'Introduce un email válido'
  if (!f.telefono.trim())      errors.telefono = 'El teléfono es obligatorio'
  if (!f.dni.trim())           errors.dni = 'El DNI/NIE es obligatorio para verificar tu identidad'
  if (f.password.length < 8)   errors.password = 'La contraseña debe tener al menos 8 caracteres'
  if (f.password !== f.passwordConfirm) errors.passwordConfirm = 'Las contraseñas no coinciden'
  return errors
}

function validateStep2(f: FormData): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!f.nombrePuesto.trim())  errors.nombrePuesto = 'El nombre del puesto es obligatorio'
  if (!f.tipo)                  errors.tipo = 'Selecciona el tipo de instalación'
  if (!f.direccion.trim())      errors.direccion = 'La dirección es obligatoria'
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

function StepIndicator({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {([1, 2] as Step[]).map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
            s === step
              ? 'bg-amber-500 border-amber-500 text-white'
              : s < step
                ? 'bg-amber-100 border-amber-400 text-amber-700'
                : 'bg-gray-100 border-gray-300 text-gray-400'
          }`}>
            {s < step ? '✓' : s}
          </div>
          <span className={`text-xs font-medium ${s === step ? 'text-amber-700' : 'text-gray-400'}`}>
            {s === 1 ? 'Tu cuenta' : 'El puesto'}
          </span>
          {s < 2 && <div className="w-8 h-px bg-gray-300 mx-1" />}
        </div>
      ))}
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function RegisterPuesto() {
  const navigate = useNavigate()
  const { login: storeLogin } = useAuthStore()
  const [step, setStep] = useState<Step>(1)
  const [form, setForm] = useState<FormData>(INITIAL)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const { position, loading: geoLoading, request: requestGeo } = useGeolocation()

  const set = (field: keyof FormData) =>
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

  // Sync geolocation result into form when it arrives
  if (position && (!form.latitud || form.latitud !== position.lat.toFixed(6))) {
    setForm((prev) => ({
      ...prev,
      latitud: position.lat.toFixed(6),
      longitud: position.lng.toFixed(6),
    }))
  }

  const handleNextStep = () => {
    const errs = validateStep1(form)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})
    setStep(2)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validateStep2(form)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setLoading(true)
    setSubmitError('')

    try {
      const { data } = await apiClient.post<{
        user: { id: string; email: string; nombre: string; apellidos: string; roles: string[] }
        puesto?: { id: string; nombre: string }
        accessToken: string
      }>('/api/auth/register', {
        email: form.email,
        password: form.password,
        nombre: form.nombre,
        apellidos: form.apellidos,
        telefono: form.telefono,
        dni: form.dni,
        roles: ['PUESTO_EMERGENCIA'],
        puesto: {
          nombre: form.nombrePuesto,
          tipo: form.tipo,
          direccion: form.direccion,
          descripcion: form.descripcion || undefined,
          latitud: parseFloat(form.latitud),
          longitud: parseFloat(form.longitud),
        },
      })

      // Guardar sesión y el puestoId en el store para acceso inmediato
      storeLogin(data.user as any, data.accessToken, data.puesto?.id)
      navigate('/auth/registro-exitoso?role=puesto')
    } catch (err: unknown) {
      const response = (err as { response?: { data?: { error?: string; details?: { field: string; message: string }[] } } })?.response

      if (response?.data?.details?.length) {
        // Mapear errores del servidor a campos del formulario
        // Los campos de "puesto.*" vienen con prefijo "puesto."
        const fieldMap: Record<string, keyof FormData> = {
          'puesto.nombre':      'nombrePuesto',
          'puesto.tipo':        'tipo',
          'puesto.direccion':   'direccion',
          'puesto.descripcion': 'descripcion',
          'puesto.latitud':     'latitud',
          'puesto.longitud':    'longitud',
          'nombre':             'nombre',
          'apellidos':          'apellidos',
          'email':              'email',
          'telefono':           'telefono',
          'dni':                'dni',
          'password':           'password',
        }

        const newErrors: Record<string, string> = {}
        let hasStep1Error = false
        let hasStep2Error = false

        for (const detail of response.data.details) {
          const formField = fieldMap[detail.field]
          if (formField) {
            newErrors[formField] = detail.message
            if (['nombre','apellidos','email','telefono','dni','password','passwordConfirm'].includes(formField)) {
              hasStep1Error = true
            } else {
              hasStep2Error = true
            }
          }
        }

        setErrors(newErrors)

        // Navegar al paso con errores (step 1 tiene prioridad)
        if (hasStep1Error) setStep(1)
        else if (hasStep2Error) setStep(2)

        if (!hasStep1Error && !hasStep2Error) {
          setSubmitError(response.data.error ?? 'Error al crear la cuenta.')
        }
      } else {
        setSubmitError(response?.data?.error ?? 'Error al crear la cuenta. Inténtalo de nuevo.')
      }

      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-amber-50">
      <div className="max-w-lg mx-auto px-4 py-8">

        {/* Cabecera */}
        <div className="mb-6">
          <button
            onClick={() => step === 1 ? navigate(-1) : setStep(1)}
            className="text-sm text-amber-700 hover:text-amber-900 flex items-center gap-1 mb-4"
          >
            ← {step === 1 ? 'Volver' : 'Paso anterior'}
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Registrar puesto de emergencia</h1>
          <p className="text-sm text-gray-500 mt-1">
            Tu solicitud será verificada antes de activarse.
          </p>
        </div>

        <StepIndicator step={step} />

        {/* ── PASO 1: Datos del responsable ── */}
        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 text-base mb-1">Datos del responsable</h2>
            <p className="text-xs text-gray-500 -mt-2 mb-3">
              Quien gestiona el puesto. Necesitamos verificar tu identidad.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label required>Nombre</Label>
                <Input value={form.nombre} onChange={set('nombre')} error={errors.nombre} placeholder="María" />
              </div>
              <div>
                <Label required>Apellidos</Label>
                <Input value={form.apellidos} onChange={set('apellidos')} error={errors.apellidos} placeholder="García López" />
              </div>
            </div>

            <div>
              <Label required>Email</Label>
              <Input type="email" value={form.email} onChange={set('email')} error={errors.email} placeholder="correo@ejemplo.com" />
            </div>

            <div>
              <Label required>Teléfono de contacto</Label>
              <Input type="tel" value={form.telefono} onChange={set('telefono')} error={errors.telefono} placeholder="+34 600 000 000" />
            </div>

            <div>
              <Label required>DNI / NIE</Label>
              <Input
                value={form.dni} onChange={set('dni')} error={errors.dni}
                placeholder="12345678A"
                maxLength={12}
              />
              <p className="mt-1 text-xs text-gray-400">
                Necesario para verificar que eres responsable del puesto. No se comparte públicamente.
              </p>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <div className="relative">
                <Label required>Contraseña</Label>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password} onChange={set('password')} error={errors.password}
                  placeholder="Mínimo 8 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-7 text-gray-400 hover:text-gray-600 text-xs"
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>

              <div className="mt-3">
                <Label required>Confirmar contraseña</Label>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={form.passwordConfirm} onChange={set('passwordConfirm')} error={errors.passwordConfirm}
                  placeholder="Repite la contraseña"
                />
              </div>
            </div>

            <Button onClick={handleNextStep} fullWidth className="mt-2">
              Continuar → Datos del puesto
            </Button>
          </div>
        )}

        {/* ── PASO 2: Datos del puesto ── */}
        {step === 2 && (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 text-base mb-1">Datos del puesto</h2>
            <p className="text-xs text-gray-500 -mt-2 mb-3">
              Información del punto de distribución que vas a gestionar.
            </p>

            <div>
              <Label required>Nombre del puesto</Label>
              <Input
                value={form.nombrePuesto} onChange={set('nombrePuesto')} error={errors.nombrePuesto}
                placeholder="Ej: CEIP La Paz, Pabellón Municipal Norte..."
              />
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
              <Input
                value={form.direccion} onChange={set('direccion')} error={errors.direccion}
                placeholder="Calle Mayor 12, Paiporta, Valencia"
              />
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

            {/* Ubicación */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-700 mb-3">
                Ubicación del puesto <span className="text-red-500">*</span>
              </p>

              <Button
                type="button"
                variant="secondary"
                fullWidth
                loading={geoLoading}
                onClick={handleUseMyLocation}
                className="mb-3"
              >
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
                  <Input
                    type="number" step="0.000001"
                    value={form.latitud} onChange={set('latitud')} error={errors.latitud}
                    placeholder="39.4254"
                  />
                </div>
                <div>
                  <Label required>Longitud</Label>
                  <Input
                    type="number" step="0.000001"
                    value={form.longitud} onChange={set('longitud')} error={errors.longitud}
                    placeholder="-0.4178"
                  />
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

            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-800">
              <strong>Acceso inmediato:</strong> Tu cuenta quedará activa al instante. Podrás iniciar sesión y gestionar tu puesto en cuanto completes el registro.
            </div>

            <Button type="submit" fullWidth loading={loading} className="bg-amber-500 hover:bg-amber-600 focus-visible:ring-amber-500">
              Enviar solicitud de registro
            </Button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-gray-500">
          ¿Ya tienes cuenta?{' '}
          <Link to="/auth/login?role=puesto" className="text-amber-600 font-medium hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
