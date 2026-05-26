import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { ROLE_LABELS, ROLE_ROUTES, Role } from '@/types/auth.types'
import { apiClient } from '@/lib/api/client'
import Button from '@/components/ui/Button'
import { getApiErrorMessage } from '@/utils/errors'

export default function Login() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { login, selectRole } = useAuthStore()

  const roleParam = params.get('role') as Role | null
  const roleLabel = roleParam ? ROLE_LABELS[roleParam] : null

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data } = await apiClient.post<{
        user: { id: string; email: string; nombre: string; apellidos: string; roles: string[] }
        accessToken: string
        accessTokenExpiresAt: string
      }>('/api/auth/login', { identifier, password })

      let puestoId: string | undefined
      if (data.user.roles.includes('PUESTO_EMERGENCIA')) {
        try {
          const res = await apiClient.get<{ puestos: { id: string }[] }>('/api/puestos/mio', {
            headers: { Authorization: `Bearer ${data.accessToken}` },
          })
          puestoId = res.data.puestos?.[0]?.id
        } catch {
          // No bloquear login si falla la carga del puesto asociado.
        }
      }

      login(data.user as any, data.accessToken, puestoId, data.accessTokenExpiresAt)

      if (roleParam) {
        selectRole(roleParam)
        navigate(ROLE_ROUTES[roleParam])
      } else if (data.user.roles.includes('COORDINADOR')) {
        navigate('/coordinador')
      } else {
        navigate('/')
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Credenciales incorrectas. Comprueba tu email, DNI y contraseña.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center px-4">
      <div className="max-w-sm mx-auto w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Iniciar sesión</h1>
          {roleLabel ? (
            <p className="mt-1 text-sm text-gray-500">
              Para acceder como <strong>{roleLabel}</strong>
            </p>
          ) : (
            <p className="mt-1 text-sm text-gray-500">Accede con tu email o DNI</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email o DNI</label>
            <input
              type="text"
              required
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              className="w-full rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm"
              placeholder="tu@email.com o 12345678A"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm"
              placeholder="********"
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" fullWidth loading={loading}>
            Entrar
          </Button>
        </form>

        <div className="mt-4 text-center">
          <Link to="/auth/request-reset" className="text-sm font-medium text-blue-600 hover:underline">
            He olvidado mi contraseña
          </Link>
          <p className="text-sm text-gray-500">
            ¿No tienes cuenta?{' '}
            <Link
              to={`/auth/register${roleParam ? `?role=${roleParam}` : ''}`}
              className="text-blue-600 font-medium hover:underline"
            >
              Regístrate
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
