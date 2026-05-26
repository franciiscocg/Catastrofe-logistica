import { useGeolocation } from '@/hooks/useGeolocation'

export default function LocationPermissionBanner() {
  const { position, error, loading, permissionState, request } = useGeolocation()
  const isPublicVerificationPage = window.location.pathname.startsWith('/verificar')

  if (isPublicVerificationPage || position || loading || !error) return null

  const isDenied = permissionState === 'denied'

  return (
    <div className="fixed inset-x-0 bottom-0 z-[3000] border-t border-amber-300 bg-amber-50 px-4 py-3 shadow-2xl">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-950">
            {isDenied ? 'Ubicacion bloqueada' : 'Ubicacion desactivada'}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-amber-900">
            {isDenied
              ? 'Activa el permiso de ubicacion desde el icono de permisos del navegador y pulsa de nuevo para reintentar.'
              : 'Activa el permiso de ubicacion para ordenar puestos por cercania, calcular rutas y registrar incidencias con tu posicion actual.'}
          </p>
        </div>
        <button
          type="button"
          onClick={request}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-amber-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2"
        >
          Activar ubicacion
        </button>
      </div>
    </div>
  )
}
