import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiClient } from '@/lib/api/client'
import Button from '@/components/ui/Button'
import { getApiErrorMessage } from '@/utils/errors'

export default function RequestPasswordReset() {
  const [email, setEmail] = useState('')
  const [dni, setDni] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setError('')
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      setLoading(false)
      return
    }
    try {
      await apiClient.post<{ ok: boolean }>('/api/auth/password-reset/request', {
        email: email.trim(),
        dni: dni.trim().toUpperCase(),
        password,
      })
      setMessage('Contraseña actualizada. Ya puedes iniciar sesión.')
      setPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo actualizar la contraseña. Revisa el correo y el DNI/NIE.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-50 px-4">
      <form onSubmit={submit} className="mx-auto w-full max-w-sm space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recuperar contraseña</h1>
          <p className="mt-1 text-sm text-gray-500">Confirma los datos de tu cuenta y elige una contraseña nueva.</p>
        </div>
        {message && <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">{message}</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <input
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Correo electrónico"
          autoComplete="email"
        />
        <input
          required
          value={dni}
          onChange={(event) => setDni(event.target.value.toUpperCase())}
          className="w-full rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="DNI/NIE"
          autoComplete="off"
        />
        <input
          required
          minLength={8}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Nueva contraseña"
          autoComplete="new-password"
        />
        <input
          required
          minLength={8}
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="w-full rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Repite la nueva contraseña"
          autoComplete="new-password"
        />
        <Button type="submit" fullWidth loading={loading}>Actualizar contraseña</Button>
        <Link to="/auth/login" className="block text-center text-sm font-medium text-blue-600 hover:underline">Volver al login</Link>
      </form>
    </div>
  )
}
