import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { ROLE_LABELS, Role } from '@/types/auth.types'
import { apiClient } from '@/lib/api/client'
import Button from '@/components/ui/Button'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { login, selectRole } = useAuthStore()

  const roleParam = params.get('role') as Role | null
  const roleLabel = roleParam ? ROLE_LABELS[roleParam] : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data } = await apiClient.post<{
        user: { id: string; email: string; nombre: string; apellidos: string; roles: string[] }
        accessToken: string
      }>('/api/auth/login', { email, password })

      // Cargar puestoId si el usuario es responsable de un puesto
      let puestoId: string | undefined
      if (data.user.roles.includes('PUESTO_EMERGENCIA')) {
        try {
          const res = await apiClient.get<{ puestos: { id: string }[] }>('/api/puestos/mio', {
            headers: { Authorization: `Bearer ${data.accessToken}` },
          })
          puestoId = res.data.puestos?.[0]?.id
        } catch { /* no bloquear el login si falla */ }
      }

      login(data.user as any, data.accessToken, puestoId)
      if (roleParam) selectRole(roleParam)
      navigate('/')
    } catch (err: unknown) {
      setError('Email o contraseña incorrectos')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center px-4">
      <div className="max-w-sm mx-auto w-full">

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Iniciar sesión</h1>
          {roleLabel && (
            <p className="mt-1 text-sm text-gray-500">
              Para acceder como <strong>{roleLabel}</strong>
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm"
              placeholder="tu@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm"
              placeholder="••••••••"
            />
          </div>

          <Button type="submit" fullWidth loading={loading}>
            Entrar
          </Button>
        </form>

        <div className="mt-4 text-center space-y-2">
          <p className="text-sm text-gray-500">
            ¿No tienes cuenta?{' '}
            <Link
              to={`/auth/register${roleParam ? `?role=${roleParam}` : ''}`}
              className="text-blue-600 font-medium hover:underline"
            >
              Regístrate
            </Link>
          </p>
          <button
            onClick={() => navigate('/')}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            ← Volver a selección de rol
          </button>
        </div>
      </div>
    </div>
  )
}
