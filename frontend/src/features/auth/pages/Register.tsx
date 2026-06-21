import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiClient } from '@/lib/api/client'
import { useAuthStore } from '@/store/auth.store'
import Button from '@/components/ui/Button'
import { getApiErrorMessage } from '@/utils/errors'
import type { User } from '@/types/auth.types'

interface StandardForm {
  nombre: string
  apellidos: string
  email: string
  dni: string
  password: string
}

type FormErrors = Partial<Record<keyof StandardForm, string>>

interface RegistrationResult {
  user: User
  accessToken: string
  accessTokenExpiresAt?: string
  recoveryCode: string
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
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
  const roleParam = params.get('role')
  const { login } = useAuthStore()

  const [form, setForm] = useState<StandardForm>({
    nombre: '',
    apellidos: '',
    email: '',
    dni: '',
    password: '',
  })
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [registration, setRegistration] = useState<RegistrationResult | null>(null)

  const updateField = (field: keyof StandardForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setFieldErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const validateForm = () => {
    const errors: FormErrors = {}
    if (form.nombre.trim().length < 2) errors.nombre = 'Introduce al menos 2 caracteres.'
    if (form.apellidos.trim().length < 2) errors.apellidos = 'Introduce al menos 2 caracteres.'
    if (!emailRegex.test(form.email.trim())) errors.email = 'Introduce un email válido.'
    if (!dniNieRegex.test(form.dni.trim().toUpperCase())) errors.dni = 'Introduce un DNI/NIE válido (ej: 12345678A).'
    if (form.password.length < 8) errors.password = 'La contraseña debe tener al menos 8 caracteres.'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (!validateForm()) return
    setLoading(true)

    try {
      const { data } = await apiClient.post('/api/auth/register', {
        email: form.email.trim(),
        password: form.password,
        nombre: form.nombre.trim(),
        apellidos: form.apellidos.trim(),
        dni: form.dni.trim().toUpperCase(),
      })

      setRegistration(data as RegistrationResult)
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se ha podido crear la cuenta.'))
    } finally {
      setLoading(false)
    }
  }

  const completeRegistration = () => {
    if (!registration) return
    login(registration.user, registration.accessToken, undefined, registration.accessTokenExpiresAt)
    navigate(roleParam === 'puesto' ? '/auth/registro-puesto' : '/seleccionar-rol')
  }

  if (registration) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8 flex flex-col justify-center">
        <div className="mx-auto w-full max-w-sm rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">Guarda tu código de recuperación</h1>
          <p className="mt-2 text-sm text-gray-600">
            Lo necesitarás si olvidas la contraseña. Por seguridad solo se muestra una vez y no se envía por correo.
          </p>
          <code className="mt-4 block select-all break-all rounded-lg bg-slate-950 px-4 py-3 text-center text-base font-semibold text-white">
            {registration.recoveryCode}
          </code>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(registration.recoveryCode)}
            className="mt-3 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Copiar código
          </button>
          <Button type="button" fullWidth className="mt-3" onClick={completeRegistration}>
            He guardado el código
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 flex flex-col justify-center">
      <div className="max-w-sm mx-auto w-full">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Crear cuenta</h1>
          <p className="text-sm text-gray-500">Completa tus datos para registrarte</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input
                value={form.nombre}
                onChange={(event) => updateField('nombre', event.target.value)}
                className={inputClass(Boolean(fieldErrors.nombre))}
                placeholder="María"
                autoComplete="given-name"
              />
              <FieldError message={fieldErrors.nombre} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Apellidos</label>
              <input
                value={form.apellidos}
                onChange={(event) => updateField('apellidos', event.target.value)}
                className={inputClass(Boolean(fieldErrors.apellidos))}
                placeholder="García López"
                autoComplete="family-name"
              />
              <FieldError message={fieldErrors.apellidos} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico</label>
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              className={inputClass(Boolean(fieldErrors.email))}
              placeholder="tu@email.com"
              autoComplete="email"
            />
            <FieldError message={fieldErrors.email} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">DNI / NIE</label>
            <input
              value={form.dni}
              onChange={(event) => updateField('dni', event.target.value.toUpperCase())}
              className={`${inputClass(Boolean(fieldErrors.dni))} uppercase`}
              placeholder="12345678A"
              autoComplete="off"
              maxLength={12}
            />
            <FieldError message={fieldErrors.dni} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <input
              type="password"
              value={form.password}
              onChange={(event) => updateField('password', event.target.value)}
              className={inputClass(Boolean(fieldErrors.password))}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
            />
            <FieldError message={fieldErrors.password} />
          </div>

          <Button type="submit" fullWidth loading={loading}>
            Crear cuenta
          </Button>
        </form>

        <div className="mt-4 text-center">
          <p className="text-sm text-gray-500">
            ¿Ya tienes cuenta?{' '}
            <Link to="/auth/login" className="text-blue-600 font-medium hover:underline">
              Inicia sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
