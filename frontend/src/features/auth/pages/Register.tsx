import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiClient } from '@/lib/api/client'
import { useAuthStore } from '@/store/auth.store'
import Button from '@/components/ui/Button'

interface StandardForm {
  nombre: string
  apellidos: string
  email: string
  dni: string
  password: string
}

type FormErrors = Partial<Record<keyof StandardForm, string>>

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

  const updateField = (field: keyof StandardForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setFieldErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const validateForm = (): boolean => {
    const errors: FormErrors = {}
    if (form.nombre.trim().length < 2) errors.nombre = 'Introduce al menos 2 caracteres.'
    if (form.apellidos.trim().length < 2) errors.apellidos = 'Introduce al menos 2 caracteres.'
    if (!emailRegex.test(form.email.trim())) errors.email = 'Introduce un email válido.'
    if (!dniNieRegex.test(form.dni.trim().toUpperCase())) errors.dni = 'Introduce un DNI/NIE válido (ej: 12345678A).'
    if (form.password.length < 8) errors.password = 'La contraseña debe tener al menos 8 caracteres.'
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
        dni: form.dni.trim().toUpperCase(),
      })

      login(data.user, data.accessToken)
      navigate('/seleccionar-rol')
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string; error?: string } } }).response?.data
        : undefined
      setError(message?.message ?? message?.error ?? 'No se ha podido crear la cuenta.')
    } finally {
      setLoading(false)
    }
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
                onChange={(e) => updateField('nombre', e.target.value)}
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
                onChange={(e) => updateField('apellidos', e.target.value)}
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
              onChange={(e) => updateField('email', e.target.value)}
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
              onChange={(e) => updateField('dni', e.target.value.toUpperCase())}
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
              onChange={(e) => updateField('password', e.target.value)}
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

        <div className="mt-4 text-center space-y-2">
          <p className="text-sm text-gray-500">
            ¿Ya tienes cuenta?{' '}
            <Link to="/auth/login" className="text-blue-600 font-medium hover:underline">
              Inicia sesión
            </Link>
          </p>
          <button
            onClick={() => navigate('/')}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            ← Volver al inicio
          </button>
        </div>
      </div>
    </div>
  )
}
