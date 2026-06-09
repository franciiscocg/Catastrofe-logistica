import { useGeolocation } from '@/hooks/useGeolocation'

function detectBrowser() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isIOS =
    /iP(hone|ad|od)/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  // Safari real: contiene "Safari" pero no es Chrome/Edge/Firefox ni sus variantes iOS.
  const isSafari = /^((?!chrome|android|crios|fxios|edg|opr).)*safari/i.test(ua)
  return { isSafari, isIOS }
}

function deniedInstructions(): string {
  const { isSafari, isIOS } = detectBrowser()

  if (isSafari && isIOS) {
    return 'Safari no vuelve a preguntar una vez bloqueada. Toca "aA" en la barra de direcciones > Ajustes del sitio web > Ubicacion > Permitir, o activala en Ajustes > Apps > Safari. Luego recarga la pagina.'
  }
  if (isSafari) {
    return 'Safari no vuelve a preguntar una vez bloqueada. Ve a Safari > Ajustes > Sitios web > Ubicacion, permite este sitio y recarga la pagina.'
  }
  return 'Activa el permiso de ubicacion desde el icono de permisos del navegador y pulsa de nuevo para reintentar.'
}

export default function LocationPermissionBanner() {
  const { position, error, loading, permissionState, request } = useGeolocation()
  const isPublicVerificationPage = window.location.pathname.startsWith('/verificar')

  if (isPublicVerificationPage || position || loading || !error) return null

  const host = window.location.hostname
  const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  // Los navegadores tratan localhost como contexto seguro para geolocalizacion.
  const isInsecureContext = window.isSecureContext === false && !isLocalhost
  const isDenied = permissionState === 'denied'

  let title: string
  let description: string

  if (isInsecureContext) {
    title = 'Ubicacion no disponible'
    description =
      'La ubicacion solo funciona con una conexion segura (HTTPS) o en localhost. Abre la app por su direccion https:// para poder activarla.'
  } else if (isDenied) {
    title = 'Ubicacion bloqueada'
    description = deniedInstructions()
  } else {
    title = 'Ubicacion desactivada'
    description =
      'Activa el permiso de ubicacion para ordenar puestos por cercania, calcular rutas y registrar incidencias con tu posicion actual.'
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[3000] border-t border-amber-300 bg-amber-50 px-4 py-3 shadow-2xl">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-950">{title}</p>
          <p className="mt-0.5 text-xs leading-5 text-amber-900">{description}</p>
        </div>
        {!isInsecureContext && (
          <button
            type="button"
            onClick={request}
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-amber-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2"
          >
            {isDenied ? 'Reintentar' : 'Activar ubicacion'}
          </button>
        )}
      </div>
    </div>
  )
}
