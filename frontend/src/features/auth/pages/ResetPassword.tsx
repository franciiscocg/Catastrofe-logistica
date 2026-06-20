import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiClient } from '@/lib/api/client'
import Button from '@/components/ui/Button'
import { getApiErrorMessage } from '@/utils/errors'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token')?.trim() ?? ''
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await apiClient.post('/api/auth/password-reset/confirm', { token, password })
      navigate('/auth/login')
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo cambiar la contraseña. Revisa el token o solicita uno nuevo.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-50 px-4">
      <form onSubmit={submit} className="mx-auto w-full max-w-sm space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Nueva contraseña</h1>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {!token ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Este enlace de recuperación no es válido. Solicita uno nuevo para continuar.
          </p>
        ) : (
          <>
            <input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border-gray-300 text-sm" placeholder="Nueva contraseña" autoComplete="new-password" />
            <Button type="submit" fullWidth loading={loading}>Actualizar contraseña</Button>
          </>
        )}
        <Link to="/auth/request-reset" className="block text-center text-sm font-medium text-blue-600 hover:underline">Solicitar otro token</Link>
      </form>
    </div>
  )
}
