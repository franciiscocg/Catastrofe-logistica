import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Map from '@/components/shared/Map'
import { apiClient } from '@/lib/api/client'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface PuestoPendiente {
  id: string
  nombre: string
  tipo: string
  direccion: string
  descripcion: string | null
  latitud: number
  longitud: number
  createdAt: string
  admin: {
    id: string
    nombre: string
    apellidos: string
    email: string
    dni: string | null
  }
}

// ── Solicitudes pendientes ─────────────────────────────────────────────────────

function SolicitudesPendientes() {
  const queryClient = useQueryClient()
  const [rechazandoId, setRechazandoId] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['puestos-pendientes'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ puestos: PuestoPendiente[] }>('/api/puestos/pendientes')
      return data.puestos
    },
  })

  const aprobar = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/api/puestos/${id}/aprobar`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['puestos-pendientes'] }),
  })

  const rechazar = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      apiClient.patch(`/api/puestos/${id}/rechazar`, { motivo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['puestos-pendientes'] })
      setRechazandoId(null)
      setMotivo('')
    },
  })

  const handleRechazar = (id: string) => {
    if (rechazandoId === id) {
      rechazar.mutate({ id, motivo })
    } else {
      setRechazandoId(id)
      setMotivo('')
    }
  }

  const pendientes = data ?? []

  return (
    <div className="px-4 pt-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900">Solicitudes de puesto pendientes</h2>
        {pendientes.length > 0 && (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold">
            {pendientes.length}
          </span>
        )}
      </div>

      {isLoading && (
        <p className="text-sm text-gray-400 text-center py-4">Cargando solicitudes...</p>
      )}

      {isError && (
        <p className="text-sm text-red-500 text-center py-4">Error al cargar las solicitudes.</p>
      )}

      {!isLoading && !isError && pendientes.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-5 text-center">
          <p className="text-sm text-gray-400">No hay solicitudes pendientes</p>
        </div>
      )}

      <div className="space-y-3">
        {pendientes.map((p) => (
          <div key={p.id} className="bg-white border border-amber-200 rounded-xl p-4 space-y-3">

            {/* Info del puesto */}
            <div className="flex items-start gap-3">
              <span className="text-2xl">🏪</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{p.nombre}</p>
                <p className="text-xs text-gray-500">{p.tipo} · {p.direccion}</p>
                {p.descripcion && (
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{p.descripcion}</p>
                )}
              </div>
            </div>

            {/* Info del responsable */}
            <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600 space-y-0.5">
              <p><span className="font-medium">Responsable:</span> {p.admin.nombre} {p.admin.apellidos}</p>
              <p><span className="font-medium">Email:</span> {p.admin.email}</p>
              {p.admin.dni && <p><span className="font-medium">DNI:</span> {p.admin.dni}</p>}
              <p><span className="font-medium">Solicitud:</span> {new Date(p.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
            </div>

            {/* Motivo de rechazo (inline) */}
            {rechazandoId === p.id && (
              <div className="space-y-2">
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={3}
                  placeholder="Escribe el motivo del rechazo (opcional)..."
                  className="w-full rounded-lg border border-red-200 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                  autoFocus
                />
                <button
                  onClick={() => { setRechazandoId(null); setMotivo('') }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancelar
                </button>
              </div>
            )}

            {/* Acciones */}
            <div className="flex gap-2">
              <Button
                fullWidth
                loading={aprobar.isPending && aprobar.variables === p.id}
                onClick={() => aprobar.mutate(p.id)}
                className="bg-green-600 hover:bg-green-700 focus-visible:ring-green-500 text-sm py-2"
              >
                Aprobar
              </Button>
              <Button
                fullWidth
                variant="secondary"
                loading={rechazar.isPending && rechazar.variables?.id === p.id}
                onClick={() => handleRechazar(p.id)}
                className="border-red-200 text-red-600 hover:bg-red-50 text-sm py-2"
              >
                {rechazandoId === p.id ? 'Confirmar rechazo' : 'Rechazar'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Dashboard principal ────────────────────────────────────────────────────────

export default function CoordinadorDashboard() {
  return (
    <div className="pb-6">

      {/* Estado general */}
      <div className="bg-purple-600 text-white px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide">Panel de coordinación</p>
        <p className="font-semibold">DANA Valencia</p>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge className="bg-purple-500 text-white">Fase: Limpieza</Badge>
          <span className="text-sm text-purple-200">Activa hace 3 días</span>
        </div>
      </div>

      {/* Métricas globales */}
      <div className="px-4 pt-4 grid grid-cols-2 gap-3">
        {[
          { label: 'Puestos activos', value: '8', icon: '🏪' },
          { label: 'Voluntarios hoy', value: '142', icon: '🙋' },
          { label: 'Entregas realizadas', value: '89', icon: '📦' },
          { label: 'Alertas activas', value: '3', icon: '⚠️' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
            <span className="text-2xl">{stat.icon}</span>
            <div>
              <p className="text-xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-500">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Solicitudes de puesto pendientes */}
      <SolicitudesPendientes />

      {/* Mapa general */}
      <div className="px-4 pt-5">
        <h2 className="font-semibold text-gray-900 mb-3">Vista general de la zona</h2>
        <Map className="h-48 w-full" />
      </div>

      {/* Alertas */}
      <div className="px-4 pt-5">
        <h2 className="font-semibold text-gray-900 mb-3">Alertas</h2>
        <div className="space-y-2">
          {[
            { texto: 'CEIP La Paz — medicamentos en nivel crítico', tipo: 'danger' as const },
            { texto: 'Zona Norte — 2 voluntarios sin asignación', tipo: 'warning' as const },
            { texto: 'Pabellón Sur — inventario actualizado', tipo: 'success' as const },
          ].map((alerta, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <Badge variant={alerta.tipo}>
                {alerta.tipo === 'danger' ? 'Crítico' : alerta.tipo === 'warning' ? 'Aviso' : 'Info'}
              </Badge>
              <p className="text-sm text-gray-700">{alerta.texto}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Acciones */}
      <div className="px-4 pt-4 space-y-2">
        <Button variant="secondary" fullWidth>🏪 Gestionar puestos</Button>
        <Button variant="secondary" fullWidth>📢 Enviar alerta global</Button>
        <Button variant="secondary" fullWidth>⚙️ Configurar catástrofe</Button>
      </div>
    </div>
  )
}
