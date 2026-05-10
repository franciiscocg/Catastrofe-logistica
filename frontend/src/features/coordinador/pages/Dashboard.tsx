import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Map from '@/components/shared/Map'
import { apiClient } from '@/lib/api/client'

interface SolicitudPuesto {
  id: string
  nombre: string
  descripcion?: string | null
  direccion: string
  latitud: number
  longitud: number
  tipo: string
  estado: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA'
  motivoRechazo?: string | null
  createdAt: string
  usuario: {
    nombre: string
    apellidos: string
    email: string
    telefono?: string | null
    dni?: string | null
  }
}

function estadoBadge(estado: SolicitudPuesto['estado']) {
  if (estado === 'PENDIENTE') return <Badge variant="warning">Pendiente</Badge>
  if (estado === 'ACEPTADA') return <Badge variant="success">Aceptada</Badge>
  return <Badge variant="danger">Rechazada</Badge>
}

export default function CoordinadorDashboard() {
  const queryClient = useQueryClient()
  const [rechazoId, setRechazoId] = useState<string | null>(null)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [actionError, setActionError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['solicitudes-puesto'],
    queryFn: () =>
      apiClient
        .get<{ solicitudes: SolicitudPuesto[] }>('/api/puestos/solicitudes')
        .then((r) => r.data.solicitudes),
  })

  const { data: puestosActivos = [] } = useQuery({
    queryKey: ['puestos-activos-coordinador'],
    queryFn: () =>
      apiClient
        .get<{ puestos: { id: string }[] }>('/api/puestos')
        .then((r) => r.data.puestos),
  })

  const aceptar = useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/puestos/solicitudes/${id}/aceptar`),
    onSuccess: () => {
      setActionError('')
      queryClient.invalidateQueries({ queryKey: ['solicitudes-puesto'] })
      queryClient.invalidateQueries({ queryKey: ['puestos-activos-coordinador'] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setActionError(msg ?? 'No se pudo aceptar la solicitud')
    },
  })

  const rechazar = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo?: string }) =>
      apiClient.post(`/api/puestos/solicitudes/${id}/rechazar`, { motivo }),
    onSuccess: () => {
      setActionError('')
      setRechazoId(null)
      setMotivoRechazo('')
      queryClient.invalidateQueries({ queryKey: ['solicitudes-puesto'] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setActionError(msg ?? 'No se pudo rechazar la solicitud')
    },
  })

  const solicitudes = data ?? []
  const pendientes = solicitudes.filter((s) => s.estado === 'PENDIENTE')

  return (
    <div className="pb-6">
      <div className="bg-purple-600 text-white px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide">Panel de coordinacion</p>
        <p className="font-semibold">DANA Valencia</p>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge className="bg-purple-500 text-white">Fase: Limpieza</Badge>
          <span className="text-sm text-purple-200">Solicitudes de puestos: {pendientes.length}</span>
        </div>
      </div>

      <div className="px-4 pt-4 grid grid-cols-2 gap-3">
        {[
          { label: 'Puestos activos', value: String(puestosActivos.length) },
          { label: 'Solicitudes pendientes', value: String(pendientes.length) },
          { label: 'Voluntarios hoy', value: '142' },
          { label: 'Alertas activas', value: '3' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-3">
            <p className="text-xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-xs text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="px-4 pt-5">
        <h2 className="font-semibold text-gray-900 mb-3">Vista general de la zona</h2>
        <Map className="h-48 w-full" />
      </div>

      <div className="px-4 pt-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Solicitudes de puestos</h2>
          <span className="text-xs text-gray-500">{solicitudes.length} total</span>
        </div>

        {actionError && (
          <p className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {actionError}
          </p>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600" />
          </div>
        ) : solicitudes.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
            <p className="font-medium text-gray-900">Sin solicitudes</p>
            <p className="text-sm text-gray-500 mt-1">Cuando un usuario pida crear un puesto aparecera aqui.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {solicitudes.map((solicitud) => (
              <div key={solicitud.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{solicitud.nombre}</p>
                    <p className="text-sm text-gray-500">{solicitud.direccion}</p>
                  </div>
                  {estadoBadge(solicitud.estado)}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <p><span className="font-medium">Tipo:</span> {solicitud.tipo}</p>
                  <p><span className="font-medium">Ubicacion:</span> {solicitud.latitud.toFixed(4)}, {solicitud.longitud.toFixed(4)}</p>
                  <p className="col-span-2">
                    <span className="font-medium">Solicitante:</span> {solicitud.usuario.nombre} {solicitud.usuario.apellidos} - {solicitud.usuario.email}
                  </p>
                  {solicitud.usuario.telefono && (
                    <p className="col-span-2"><span className="font-medium">Telefono:</span> {solicitud.usuario.telefono}</p>
                  )}
                  {solicitud.descripcion && (
                    <p className="col-span-2"><span className="font-medium">Notas:</span> {solicitud.descripcion}</p>
                  )}
                  {solicitud.motivoRechazo && (
                    <p className="col-span-2 text-red-700"><span className="font-medium">Motivo rechazo:</span> {solicitud.motivoRechazo}</p>
                  )}
                </div>

                {solicitud.estado === 'PENDIENTE' && (
                  <div className="mt-4 flex gap-2">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      loading={aceptar.isPending && aceptar.variables === solicitud.id}
                      onClick={() => aceptar.mutate(solicitud.id)}
                    >
                      Aceptar
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={rechazar.isPending && rechazar.variables?.id === solicitud.id}
                      onClick={() => {
                        setActionError('')
                        setRechazoId(solicitud.id)
                        setMotivoRechazo('')
                      }}
                    >
                      Rechazar
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pt-4 space-y-2">
        <Button variant="secondary" fullWidth>Gestionar puestos</Button>
        <Button variant="secondary" fullWidth>Enviar alerta global</Button>
        <Button variant="secondary" fullWidth>Configurar catastrofe</Button>
      </div>

      {rechazoId && (
        <div className="fixed inset-0 z-[2000] bg-black/40 flex items-end sm:items-center justify-center px-4 py-6">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              rechazar.mutate({
                id: rechazoId,
                motivo: motivoRechazo.trim() || undefined,
              })
            }}
            className="w-full max-w-sm bg-white rounded-xl border border-gray-200 p-4 shadow-xl space-y-3"
          >
            <div>
              <p className="font-semibold text-gray-900">Rechazar solicitud</p>
              <p className="text-sm text-gray-500 mt-1">Indica el motivo para que el puesto pueda corregirla.</p>
            </div>
            <textarea
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              rows={3}
              placeholder="Faltan datos de ubicacion, no procede en esta zona..."
              className="w-full rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setRechazoId(null)
                  setMotivoRechazo('')
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="danger" loading={rechazar.isPending}>
                Rechazar
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
