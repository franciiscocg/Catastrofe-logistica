import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '@/lib/api/client'
import Button from '@/components/ui/Button'

export default function RequestPasswordReset() {
  const [identifier, setIdentifier] = useState('')
  const [message, setMessage] = useState('')
  const [devToken, setDevToken] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setDevToken('')
    try {
      const { data } = await apiClient.post<{ sent: boolean; resetToken?: string }>('/api/auth/password-reset/request', { identifier })
      setMessage('Si existe una cuenta con esos datos, enviaremos instrucciones de recuperacion.')
      if (data.resetToken) setDevToken(data.resetToken)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-50 px-4">
      <form onSubmit={submit} className="mx-auto w-full max-w-sm space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recuperar contrasena</h1>
          <p className="mt-1 text-sm text-gray-500">Introduce tu email o DNI.</p>
        </div>
        {message && <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">{message}</p>}
        {devToken && <p className="break-all rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Token desarrollo: {devToken}</p>}
        <input
          required
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          className="w-full rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="tu@email.com o 12345678A"
          autoComplete="username"
        />
        <Button type="submit" fullWidth loading={loading}>Enviar instrucciones</Button>
        <Link to="/auth/login" className="block text-center text-sm font-medium text-blue-600 hover:underline">Volver al login</Link>
      </form>
    </div>
  )
}
