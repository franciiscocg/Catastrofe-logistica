import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiClient } from '@/lib/api/client'
import Button from '@/components/ui/Button'

export default function VerifyAccount() {
  const [params] = useSearchParams()
  const [token, setToken] = useState(params.get('token') ?? '')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await apiClient.post('/api/auth/verify-account', { token })
      setMessage('Cuenta verificada. Ya puedes iniciar sesion.')
    } catch {
      setError('Token invalido o caducado.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-50 px-4">
      <form onSubmit={submit} className="mx-auto w-full max-w-sm space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Verificar cuenta</h1>
        {message && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <input required value={token} onChange={(event) => setToken(event.target.value)} className="w-full rounded-lg border-gray-300 text-sm" placeholder="Token de verificacion" />
        <Button type="submit" fullWidth loading={loading}>Verificar</Button>
        <Link to="/auth/login" className="block text-center text-sm font-medium text-blue-600 hover:underline">Ir al login</Link>
      </form>
    </div>
  )
}
