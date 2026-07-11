import { useState } from 'react'
import { useGeolocation } from '@/hooks/useGeolocation'

function detectBrowser() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const vendor = typeof navigator !== 'undefined' ? navigator.vendor || '' : ''
  const platform = typeof navigator !== 'undefined' ? navigator.platform || '' : ''
  const maxTouchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0

  // En iOS/iPadOS TODOS los navegadores (Chrome, Firefox, la web-view de apps como
  // Google, etc.) usan WebKit, por lo que comparten el modelo de permisos de Safari.
  // El iPad moderno se presenta como "MacIntel" con pantalla tactil.
  const isIOS =
    /iP(hone|ad|od)/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1)

  // Cualquier marca no-WebKit en el UA descarta que sea Safari de escritorio.
  const isOtherBrand =
    /\b(CriOS|Chrome|Chromium|Edg|EdgiOS|OPR|OPiOS|FxiOS|Firefox|SamsungBrowser|YaBrowser|UCBrowser|GSA)\b/i.test(ua)
  const isMacSafari = !isIOS && !isOtherBrand && /Safari/i.test(ua) && vendor.includes('Apple')

  return { isIOS, isMacSafari }
}

function deniedInstructions(): string {
  const { isIOS, isMacSafari } = detectBrowser()

  if (isIOS) {
    return 'En iPhone/iPad el permiso no se vuelve a pedir desde la web. Toca "aA" o el icono de la barra de direcciones > Ajustes del sitio web > Ubicación > Permitir, o actívala en los Ajustes del sistema para este navegador. Luego recarga la página.'
  }
  if (isMacSafari) {
    return 'Safari no vuelve a preguntar una vez bloqueada. Ve a Safari > Ajustes > Sitios web > Ubicación, permite este sitio y recarga la página.'
  }
  return 'Pulsa el icono de permisos del navegador junto a la dirección, permite la ubicación y recarga la página.'
}

export default function LocationPermissionBanner() {
  const { position, error, loading, permissionState, request } = useGeolocation()
  const [dismissed, setDismissed] = useState(false)
  const isPublicVerificationPage = window.location.pathname.startsWith('/verificar')

  if (isPublicVerificationPage || position || loading || !error || dismissed) return null

  const host = window.location.hostname
  const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  // Los navegadores tratan localhost como contexto seguro para geolocalizacion.
  const isInsecureContext = window.isSecureContext === false && !isLocalhost
  const isDenied = permissionState === 'denied'

  let title: string
  let description: string

  if (isInsecureContext) {
    title = 'Ubicación no disponible'
    description =
      'La ubicación solo funciona con una conexión segura (HTTPS) o en localhost. Abre la app por su dirección https:// para poder activarla.'
  } else if (isDenied) {
    title = 'Ubicación bloqueada'
    description = deniedInstructions()
  } else {
    title = 'Ubicación desactivada'
    const { isIOS, isMacSafari } = detectBrowser()
    description = isIOS || isMacSafari
      ? 'Safari necesita que pulses el botón para solicitar la ubicación. La primera posición puede ser aproximada y se mejorará mientras usas la app.'
      : 'Activa el permiso de ubicación para ordenar puestos por cercanía, calcular rutas y registrar incidencias con tu posición actual.'
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[3000] border-t border-amber-300 bg-amber-50 px-4 py-3 shadow-2xl">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-950">{title}</p>
          <p className="mt-0.5 text-xs leading-5 text-amber-900">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isInsecureContext && (
            <button
              type="button"
              onClick={request}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-amber-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2"
            >
              {isDenied ? 'Reintentar' : 'Activar ubicación'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Cerrar aviso"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-amber-700 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
