import { Link, useSearchParams } from 'react-router-dom'
import { ROLE_LABELS, Role } from '@/types/auth.types'

export default function RegisterSuccess() {
  const [params] = useSearchParams()
  const role = params.get('role') as Role | null
  const roleLabel = role ? ROLE_LABELS[role] : null

  const messages: Record<string, { icon: string; title: string; body: string }> = {
    puesto: {
      icon: 'Puesto',
      title: 'Solicitud enviada',
      body: 'Tu cuenta esta activa. El puesto quedara pendiente hasta que un coordinador revise y acepte la solicitud.',
    },
  }

  const msg = (role && messages[role]) ?? {
    icon: '✅',
    title: '¡Cuenta creada!',
    body: 'Tu cuenta ha sido creada correctamente. Ya puedes iniciar sesión.',
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center px-4">
      <div className="max-w-sm mx-auto w-full text-center">
        <div className="text-5xl mb-4">{msg.icon}</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">{msg.title}</h1>
        {roleLabel && (
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">{roleLabel}</p>
        )}
        <p className="text-sm text-gray-600 leading-relaxed mb-8">{msg.body}</p>

        <Link
          to={role ? `/auth/login?role=${role}` : '/'}
          className="inline-flex items-center justify-center w-full bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
        >
          Ir a iniciar sesión
        </Link>
        <Link to="/" className="block mt-3 text-sm text-gray-400 hover:text-gray-600">
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
