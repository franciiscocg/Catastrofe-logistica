import { Link, useSearchParams } from 'react-router-dom'

type SuccessMessage = {
  icon: string
  title: string
  body: string
  linkText: string
  linkTo: string
}

export default function RegisterSuccess() {
  const [params] = useSearchParams()
  const role = params.get('role')
  const verification = params.get('verification')
  const emailSent = params.get('emailSent') !== 'false'

  const messages: Record<string, SuccessMessage> = {
    puesto: {
      icon: '...',
      title: 'Solicitud enviada',
      body: 'Tu cuenta y solicitud de puesto de emergencia han sido recibidas correctamente. Un coordinador revisará la solicitud y activará el acceso cuando sea aprobada.',
      linkText: 'Volver al inicio',
      linkTo: '/',
    },
  }

  const fallbackMessage: SuccessMessage = {
    icon: 'OK',
    title: 'Cuenta creada',
    body: 'Tu cuenta ha sido creada correctamente. Ya puedes acceder a la aplicación.',
    linkText: 'Iniciar sesión',
    linkTo: '/auth/login',
  }
  const verificationMessage: SuccessMessage = {
    icon: 'OK',
    title: 'Revisa tu email',
    body: 'Hemos creado tu cuenta y te hemos enviado un enlace de verificación. Verifica tu email antes de iniciar sesión.',
    linkText: 'Ir al login',
    linkTo: '/auth/login',
  }
  const verificationDeliveryFailedMessage: SuccessMessage = {
    icon: '!',
    title: 'Cuenta creada',
    body: 'No hemos podido enviar el email de verificación. Ve a verificar cuenta y solicita un nuevo enlace.',
    linkText: 'Reenviar verificación',
    linkTo: '/auth/verify-account',
  }
  const msg = verification === 'pending'
    ? (emailSent ? verificationMessage : verificationDeliveryFailedMessage)
    : (role ? messages[role] : undefined) ?? fallbackMessage

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center px-4">
      <div className="max-w-sm mx-auto w-full text-center">
        <div className="text-5xl mb-4">{msg.icon}</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">{msg.title}</h1>
        <p className="text-sm text-gray-600 leading-relaxed mb-8">{msg.body}</p>

        <Link
          to={msg.linkTo}
          className="inline-flex items-center justify-center w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
        >
          {msg.linkText}
        </Link>
        {msg.linkTo !== '/' && (
          <Link to="/" className="block mt-3 text-sm text-gray-400 hover:text-gray-600">
            Volver al inicio
          </Link>
        )}
      </div>
    </div>
  )
}
