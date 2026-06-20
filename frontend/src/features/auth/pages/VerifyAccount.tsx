import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiClient } from '@/lib/api/client'
import Button from '@/components/ui/Button'
import { getApiErrorMessage } from '@/utils/errors'

export default function VerifyAccount() {
  const [params] = useSearchParams()
  const [token, setToken] = useState(params.get('token') ?? '')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [resendMessage, setResendMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await apiClient.post('/api/auth/verify-account', { token })
      setMessage('Cuenta verificada. Ya puedes iniciar sesión.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Token inválido o caducado.'))
    } finally {
      setLoading(false)
    }
  }

  const resend = async (event: React.FormEvent) => {
    event.preventDefault()
    setResending(true)
    setResendMessage('')
    try {
      await apiClient.post<{ sent: boolean }>('/api/auth/verify-account/resend', { identifier, password })
      setResendMessage('Si la cuenta existe y está pendiente de verificar, enviaremos un nuevo enlace.')
    } catch (err) {
      setResendMessage(getApiErrorMessage(err, 'No se pudo reenviar el enlace de verificación.'))
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-50 px-4">
      <div className="mx-auto w-full max-w-sm space-y-4">
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">Verificar cuenta</h1>
          {message && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <input required value={token} onChange={(event) => setToken(event.target.value)} className="w-full rounded-lg border-gray-300 text-sm" placeholder="Token de verificación" />
          <Button type="submit" fullWidth loading={loading}>Verificar</Button>
          <Link to="/auth/login" className="block text-center text-sm font-medium text-blue-600 hover:underline">Ir al login</Link>
        </form>

        <form onSubmit={resend} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Reenviar enlace</h2>
            <p className="mt-1 text-sm text-gray-500">Usa tu email o DNI si el enlace ha caducado.</p>
          </div>
          {resendMessage && <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">{resendMessage}</p>}
          <input required value={identifier} onChange={(event) => setIdentifier(event.target.value)} className="w-full rounded-lg border-gray-300 text-sm" placeholder="tu@email.com o 12345678A" />
          <input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border-gray-300 text-sm" placeholder="Contraseña" autoComplete="current-password" />
          <Button type="submit" variant="secondary" fullWidth loading={resending}>Reenviar verificación</Button>
        </form>
      </div>
    </div>
  )
}
