import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ROLE_LABELS, ROLE_ROUTES, Role } from '@/types/auth.types'
import { apiClient } from '@/lib/api/client'
import { useAuthStore } from '@/store/auth.store'
import Button from '@/components/ui/Button'
import RegisterPuesto from './RegisterPuesto'

type RegisterForm = {
  nombre: string
  apellidos: string
  email: string
  password: string
  telefono: string
  dni: string
}

type FormErrors = Partial<Record<keyof RegisterForm, string>>

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TELEFONO_LENGTH = 9
const telefonoRegex = /^\d{9}$/
const dniNieRegex = /^([0-9]{8}[A-Za-z]|[XYZxyz][0-9]{7}[A-Za-z])$/

function inputClass(hasError?: boolean) {
  return `w-full rounded-lg text-sm ${
    hasError
      ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
      : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
  }`
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-xs text-red-600">{message}</p>
}

export default function Register() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { login, selectRole } = useAuthStore()

  const rawRole = params.get('role')
  const roleParam = useMemo(
    () => (Object.values(Role).includes(rawRole as Role) ? (rawRole as Role) : Role.CIUDADANO),
    [rawRole],
  )
  const roleLabel = ROLE_LABELS[roleParam]
  const isVolunteer = roleParam === Role.VOLUNTARIO
  const registrationUnavailable = roleParam === Role.PUESTO || roleParam === Role.COORDINADOR

  const [form, setForm] = useState<RegisterForm>({
    nombre: '',
    apellidos: '',
    email: '',
    password: '',
    telefono: '',
    dni: '',
  })
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const updateField = (field: keyof RegisterForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const validateForm = () => {
    const errors: FormErrors = {}
    const nombre = form.nombre.trim()
    const apellidos = form.apellidos.trim()
    const email = form.email.trim()
    const telefono = form.telefono.trim()
    const dni = form.dni.trim()

    if (nombre.length < 2) errors.nombre = 'Introduce al menos 2 caracteres.'
    if (apellidos.length < 2) errors.apellidos = 'Introduce al menos 2 caracteres.'
    if (!emailRegex.test(email)) errors.email = 'Introduce un email valido.'
    if (form.password.length < 8) errors.password = 'La contrasena debe tener al menos 8 caracteres.'

    if (telefono && !telefonoRegex.test(telefono)) {
      errors.telefono = `Introduce un telefono de ${TELEFONO_LENGTH} digitos.`
    }

    if (isVolunteer) {
      if (!telefono) errors.telefono = 'El telefono es obligatorio para voluntarios.'
      if (!dniNieRegex.test(dni)) errors.dni = 'Introduce un DNI/NIE valido.'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!validateForm()) return

    setLoading(true)

    try {
      const { data } = await apiClient.post('/api/auth/register', {
        email: form.email.trim(),
        password: form.password,
        nombre: form.nombre.trim(),
        apellidos: form.apellidos.trim(),
        telefono: form.telefono.trim() || undefined,
        dni: form.dni.trim().toUpperCase() || undefined,
        role: isVolunteer ? 'voluntario' : 'ciudadano',
      })

      login(data.user, data.accessToken)
      selectRole(roleParam)
      navigate(ROLE_ROUTES[roleParam])
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string; error?: string; details?: { message: string }[] } } }).response?.data
        : undefined
      setError(message?.message ?? message?.error ?? message?.details?.[0]?.message ?? 'No se ha podido crear la cuenta')
    } finally {
      setLoading(false)
    }
  }

  // Formularios específicos por rol
  if (roleParam === Role.PUESTO) return <RegisterPuesto />

  // Stub genérico para los demás roles (a implementar en Mes 2)
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-md mx-auto w-full">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Crear cuenta</h1>
          <p className="text-sm text-gray-500">
            Registro como <strong>{roleLabel}</strong>
          </p>
        </div>

        {registrationUnavailable ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 text-center">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 mb-6">
              El alta de este rol debe realizarla un coordinador del sistema.
            </div>
            <Button onClick={() => navigate(-1)} variant="secondary" fullWidth>
              Volver
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input
                  value={form.nombre}
                  onChange={(e) => updateField('nombre', e.target.value)}
                  className={inputClass(Boolean(fieldErrors.nombre))}
                  placeholder="Maria"
                  autoComplete="given-name"
                />
                <FieldError message={fieldErrors.nombre} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Apellidos</label>
                <input
                  value={form.apellidos}
                  onChange={(e) => updateField('apellidos', e.target.value)}
                  className={inputClass(Boolean(fieldErrors.apellidos))}
                  placeholder="Garcia Lopez"
                  autoComplete="family-name"
                />
                <FieldError message={fieldErrors.apellidos} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                className={inputClass(Boolean(fieldErrors.email))}
                placeholder="tu@email.com"
                autoComplete="email"
              />
              <FieldError message={fieldErrors.email} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contrasena</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => updateField('password', e.target.value)}
                className={inputClass(Boolean(fieldErrors.password))}
                placeholder="Minimo 8 caracteres"
                autoComplete="new-password"
              />
              <FieldError message={fieldErrors.password} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Telefono{isVolunteer && <span className="text-red-500"> *</span>}
                </label>
                <input
                  value={form.telefono}
                  onChange={(e) => updateField('telefono', e.target.value.replace(/\D/g, '').slice(0, TELEFONO_LENGTH))}
                  className={inputClass(Boolean(fieldErrors.telefono))}
                  placeholder="600000000"
                  autoComplete="tel"
                  inputMode="numeric"
                  maxLength={TELEFONO_LENGTH}
                />
                <FieldError message={fieldErrors.telefono} />
              </div>

              {isVolunteer && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    DNI/NIE <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.dni}
                    onChange={(e) => updateField('dni', e.target.value)}
                    className={`${inputClass(Boolean(fieldErrors.dni))} uppercase`}
                    placeholder="12345678A"
                    autoComplete="off"
                  />
                  <FieldError message={fieldErrors.dni} />
                </div>
              )}
            </div>

            <Button type="submit" fullWidth loading={loading}>
              Crear cuenta
            </Button>
          </form>
        )}

        <div className="mt-4 text-center space-y-2">
          <p className="text-sm text-gray-500">
            Ya tienes cuenta?{' '}
            <Link to={`/auth/login?role=${roleParam}`} className="text-blue-600 font-medium hover:underline">
              Inicia sesion
            </Link>
          </p>
          <button
            onClick={() => navigate('/')}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Volver a seleccion de rol
          </button>
        </div>
      </div>
    </div>
  )
}
