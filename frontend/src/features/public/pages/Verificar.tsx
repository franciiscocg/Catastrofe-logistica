import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { apiClient } from '@/lib/api/client'

type TipoEvento =
  | 'DONACION_CREADA'
  | 'DONACION_EN_CAMINO'
  | 'DONACION_ENTREGADA'
  | 'DONACION_CANCELADA'
  | 'INVENTARIO_ENTRADA'
  | 'INVENTARIO_SALIDA'
  | 'INVENTARIO_ACTUALIZADO'

interface ChainEvent {
  id: string
  sequence: number
  tipo: TipoEvento
  actorRol: string | null
  entidad: string
  entidadId: string
  payload: Record<string, unknown>
  hashPrevio: string
  hashPropio: string
  tsaTimestamp: string | null
  createdAt: string
}

interface ChainResponse {
  entidadId: string
  entidad: string
  events: ChainEvent[]
}

interface StatsResponse {
  total: number
  withTSA: number
  latestSequence: number
  latestHash: string | null
}

interface VerifyResponse {
  valid: boolean
  totalEvents: number
  brokenAt?: number
  brokenEventId?: string
}

const TIPO_LABEL: Record<TipoEvento, string> = {
  DONACION_CREADA: 'Donación registrada',
  DONACION_EN_CAMINO: 'Voluntario en camino',
  DONACION_ENTREGADA: 'Entregado en puesto',
  DONACION_CANCELADA: 'Donación cancelada',
  INVENTARIO_ENTRADA: 'Entrada de stock',
  INVENTARIO_SALIDA: 'Salida a ciudadano',
  INVENTARIO_ACTUALIZADO: 'Inventario ajustado',
}

const TIPO_COLOR: Record<TipoEvento, string> = {
  DONACION_CREADA: 'bg-blue-100 text-blue-800',
  DONACION_EN_CAMINO: 'bg-yellow-100 text-yellow-800',
  DONACION_ENTREGADA: 'bg-green-100 text-green-800',
  DONACION_CANCELADA: 'bg-red-100 text-red-800',
  INVENTARIO_ENTRADA: 'bg-emerald-100 text-emerald-800',
  INVENTARIO_SALIDA: 'bg-purple-100 text-purple-800',
  INVENTARIO_ACTUALIZADO: 'bg-gray-100 text-gray-800',
}

function HashPill({ hash, label }: { hash: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
      <span className="text-gray-400">{label}:</span>
      <span className="truncate max-w-[200px]" title={hash}>{hash.slice(0, 16)}…</span>
    </div>
  )
}

function EventCard({ ev }: { ev: ChainEvent }) {
  const [expanded, setExpanded] = useState(false)
  const tipo = ev.tipo as TipoEvento
  const payload = ev.payload as Record<string, unknown>

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 font-mono">#{ev.sequence}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIPO_COLOR[tipo] ?? 'bg-gray-100 text-gray-700'}`}>
              {TIPO_LABEL[tipo] ?? ev.tipo}
            </span>
            {ev.tsaTimestamp && (
              <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                ✓ Sellado RFC 3161
              </span>
            )}
          </div>
          <span className="text-sm text-gray-700">
            {typeof payload.producto === 'object' && payload.producto !== null
              ? String((payload.producto as Record<string, unknown>).nombre ?? '')
              : ''}
            {typeof payload.cantidad === 'number' && (
              <span className="text-gray-500 ml-1">· {payload.cantidad} {String(payload.unidad ?? '')}</span>
            )}
          </span>
          <span className="text-xs text-gray-400">{new Date(ev.createdAt).toLocaleString('es-ES')}</span>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-blue-600 hover:underline shrink-0"
        >
          {expanded ? 'Ocultar' : 'Ver prueba'}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-2">
          <HashPill hash={ev.hashPrevio} label="Hash anterior" />
          <HashPill hash={ev.hashPropio} label="Hash propio" />
          {ev.tsaTimestamp && (
            <p className="text-xs text-indigo-600">
              Sellado por TSA el {new Date(ev.tsaTimestamp).toLocaleString('es-ES')}
            </p>
          )}
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer hover:text-gray-700">Datos del evento</summary>
            <pre className="mt-1 bg-gray-50 rounded p-2 overflow-x-auto text-[11px]">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}

export default function Verificar() {
  const { id } = useParams<{ id?: string }>()
  const [input, setInput] = useState(id ?? '')
  const [busqueda, setBusqueda] = useState<{ tipo: 'donacion' | 'inventario'; id: string } | null>(
    id ? { tipo: 'donacion', id } : null,
  )

  const { data: stats } = useQuery<StatsResponse>({
    queryKey: ['audit-stats'],
    queryFn: () => apiClient.get('/api/public/audit/stats').then((r) => r.data),
    staleTime: 30_000,
  })

  const { data: chainData, isLoading, isError } = useQuery<ChainResponse>({
    queryKey: ['audit-chain', busqueda],
    queryFn: () =>
      apiClient
        .get(`/api/public/audit/${busqueda!.tipo}/${busqueda!.id}`)
        .then((r) => r.data),
    enabled: !!busqueda,
  })

  const { data: verifyData, refetch: runVerify, isFetching: verifying } = useQuery<VerifyResponse>({
    queryKey: ['audit-verify'],
    queryFn: () => apiClient.get('/api/public/audit/verify').then((r) => r.data),
    enabled: false,
  })

  function handleBuscar() {
    const trimmed = input.trim()
    if (!trimmed) return
    setBusqueda({ tipo: 'donacion', id: trimmed })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-5">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900">Registro público de ayuda humanitaria</h1>
          <p className="text-sm text-gray-500 mt-1">
            Consulta el historial verificable de cualquier donación. Todos los registros están
            protegidos criptográficamente y sellados por una Autoridad de Sellado de Tiempo (RFC 3161).
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Eventos registrados', value: stats.total },
              { label: 'Sellados RFC 3161', value: stats.withTSA },
              { label: 'Último nº de secuencia', value: stats.latestSequence },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-3 text-center shadow-sm">
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Buscador */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-3">
          <p className="text-sm font-medium text-gray-700">Buscar por ID de donación</p>
          <div className="flex gap-2">
            <input
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="ID de donación (ej: cly3k2...)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
            />
            <button
              onClick={handleBuscar}
              className="bg-blue-600 text-white text-sm px-4 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Buscar
            </button>
          </div>
        </div>

        {/* Resultados */}
        {isLoading && <p className="text-center text-gray-500 text-sm">Buscando eventos…</p>}
        {isError && (
          <p className="text-center text-red-500 text-sm">No se encontraron eventos para este ID.</p>
        )}
        {chainData && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600 font-medium">
              {chainData.events.length} evento{chainData.events.length !== 1 ? 's' : ''} encontrados
            </p>
            {chainData.events.map((ev) => (
              <EventCard key={ev.id} ev={ev} />
            ))}
          </div>
        )}

        {/* Verificación de integridad */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Verificar integridad de la cadena</p>
              <p className="text-xs text-gray-400">Recomputa todos los hashes y detecta cualquier manipulación</p>
            </div>
            <button
              onClick={() => runVerify()}
              disabled={verifying}
              className="text-sm bg-gray-800 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {verifying ? 'Verificando…' : 'Verificar ahora'}
            </button>
          </div>
          {verifyData && (
            <div className={`rounded-lg px-4 py-3 text-sm ${verifyData.valid ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {verifyData.valid
                ? `✓ Cadena íntegra — ${verifyData.totalEvents} eventos verificados correctamente`
                : `✗ Cadena comprometida en el evento #${verifyData.brokenAt} (ID: ${verifyData.brokenEventId})`}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400">
          Sistema de trazabilidad basado en hash-chain SHA-256 con sellado de tiempo RFC 3161 (eIDAS) ·{' '}
          <a href="/api/public/audit/stats" target="_blank" className="underline hover:text-gray-600">API pública</a>
        </p>
      </div>
    </div>
  )
}
