import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface PuestoMarker {
  id: string
  nombre: string
  direccion: string
  latitud: number
  longitud: number
  necesidades: number
  distanciaKm?: number
}

export interface IncidenciaMarker {
  id: string
  titulo?: string | null
  categoria?: string | null
  latitud: number
  longitud: number
  estado: 'CORTADA' | 'TRANSITABLE'
  descripcion?: string | null
  createdAt?: string
  pendingSync?: boolean
  comentarios?: ComentarioIncidenciaMarker[]
  _count?: {
    comentarios?: number
  }
}

export interface ComentarioIncidenciaMarker {
  id: string
  estado: 'CORTADA' | 'TRANSITABLE'
  comentario: string
  createdAt: string
  autor?: {
    id: string
    nombre: string
    apellidos: string
  } | null
}

export type IncidenciaAction = 'comentar'

interface MapProps {
  center?: [number, number]
  zoom?: number
  userPosition?: [number, number] | null
  reportPoint?: [number, number] | null
  selectingReportPoint?: boolean
  puestos?: PuestoMarker[]
  incidencias?: IncidenciaMarker[]
  selectedPuestoId?: string | null
  onPuestoSelect?: (id: string) => void
  onVerInventarioPuesto?: (id: string) => void
  onUserLocated?: (pos: [number, number]) => void
  onReportPointSelect?: (pos: [number, number]) => void
  onIncidenciaAction?: (incidencia: IncidenciaMarker, action: IncidenciaAction) => void
  onIncidenciaCommentsOpen?: (incidencia: IncidenciaMarker) => void
  route?: [number, number][] | null
  focusUserPositionKey?: number
  markerVariant?: 'urgency' | 'neutral'
  className?: string
}

// ── Iconos personalizados ─────────────────────────────────────────────────────

function puestoIcon(necesidades: number, selected: boolean, variant: 'urgency' | 'neutral') {
  const bg =
    variant === 'urgency'
      ? necesidades >= 3 ? '#ef4444' : necesidades >= 1 ? '#f59e0b' : '#22c55e'
      : '#3b82f6'
  const ring = selected
    ? `box-shadow:0 0 0 5px ${bg}44,0 2px 10px rgba(0,0,0,0.4);transform:scale(1.15);`
    : 'box-shadow:0 2px 8px rgba(0,0,0,0.3);'
  const label = variant === 'urgency'
    ? (necesidades > 0 ? String(necesidades) : '✓')
    : '🏪'
  return L.divIcon({
    html: `<div style="
      width:32px;height:32px;background:${bg};
      border:3px solid white;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      color:white;font-size:${variant === 'neutral' ? '14' : '11'}px;font-weight:700;
      transition:transform 0.2s;
      ${ring}
    ">${label}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -20],
    className: '',
  })
}

function userIcon() {
  return L.divIcon({
    html: `<div style="
      width:18px;height:18px;background:#3b82f6;
      border:3px solid white;border-radius:50%;
      box-shadow:0 0 0 5px rgba(59,130,246,0.25),0 2px 6px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    className: '',
  })
}

function reportIcon() {
  return L.divIcon({
    html: `<div style="
      width:24px;height:24px;background:#0f172a;
      border:3px solid white;border-radius:50%;
      box-shadow:0 0 0 7px rgba(15,23,42,0.15),0 4px 12px rgba(0,0,0,0.35);
      animation:pulse-report 1.6s ease-in-out infinite;
      display:flex;align-items:center;justify-content:center;
      color:white;font-size:11px;font-weight:700;
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    className: '',
  })
}

function incidenciaIcon(estado: 'CORTADA' | 'TRANSITABLE', pendingSync?: boolean) {
  const bg = estado === 'CORTADA' ? '#dc2626' : '#16a34a'
  const symbol = pendingSync ? '...' : estado === 'CORTADA' ? '!' : 'OK'
  const opacity = pendingSync ? '0.72' : '1'
  return L.divIcon({
    html: `<div style="
      width:28px;height:28px;background:${bg};
      border:3px solid white;border-radius:50%;opacity:${opacity};
      box-shadow:0 4px 10px rgba(0,0,0,0.35);
      color:white;font-size:10px;font-weight:800;
      display:flex;align-items:center;justify-content:center;
    ">${symbol}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    className: '',
  })
}

// ── Subcomponentes internos ───────────────────────────────────────────────────

function FlyTo({ position, zoom }: { position: [number, number]; zoom?: number }) {
  const map = useMap()
  const prev = useRef('')
  useEffect(() => {
    const key = position.join(',')
    if (key === prev.current) return
    prev.current = key
    map.flyTo(position, zoom ?? map.getZoom(), { duration: 0.8 })
  }, [position, zoom, map])
  return null
}

function FitRoute({ points }: { points: [number, number][] }) {
  const map = useMap()
  const prev = useRef('')
  useEffect(() => {
    if (points.length < 2) return
    const key = `${points[0]}-${points[points.length - 1]}`
    if (key === prev.current) return
    prev.current = key
    map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 16, animate: true })
  }, [points, map])
  return null
}

function FocusUserPosition({
  position,
  triggerKey,
}: {
  position: [number, number]
  triggerKey: number
}) {
  const map = useMap()

  useEffect(() => {
    map.flyTo(position, Math.max(map.getZoom(), 15), { duration: 0.8 })
  }, [position, triggerKey, map])

  return null
}

function LocateButton({ onLocated }: { onLocated: (pos: [number, number]) => void }) {
  const map = useMap()

  useMapEvents({
    locationfound(e) {
      onLocated([e.latlng.lat, e.latlng.lng])
    },
  })

  return (
    <div className="leaflet-bottom leaflet-right" style={{ marginBottom: 24, marginRight: 10 }}>
      <div className="leaflet-control">
        <button
          onClick={() => map.locate({ setView: true, maxZoom: 15, enableHighAccuracy: true })}
          title="Mi ubicación"
          style={{
            width: 40, height: 40, background: 'white',
            border: '2px solid rgba(0,0,0,0.2)', borderRadius: 8,
            cursor: 'pointer', fontSize: 18, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
          }}
        >
          📍
        </button>
      </div>
    </div>
  )
}

function ReportPointSelector({
  enabled,
  onSelect,
}: {
  enabled: boolean
  onSelect: (pos: [number, number]) => void
}) {
  useMapEvents({
    click(e) {
      if (!enabled) return
      onSelect([e.latlng.lat, e.latlng.lng])
    },
  })

  return null
}

// ── Componente principal ──────────────────────────────────────────────────────

const VALENCIA: [number, number] = [39.4250, -0.4000]

function isValidLatLng(position: [number, number] | null | undefined): position is [number, number] {
  return Array.isArray(position) && position.length === 2 && Number.isFinite(position[0]) && Number.isFinite(position[1])
}

function hasValidMarkerPosition(marker: { latitud: number; longitud: number }) {
  return Number.isFinite(marker.latitud) && Number.isFinite(marker.longitud)
}

export default function Map({
  center = VALENCIA,
  zoom = 13,
  userPosition,
  reportPoint,
  selectingReportPoint = false,
  puestos = [],
  incidencias = [],
  selectedPuestoId,
  onPuestoSelect,
  onVerInventarioPuesto,
  onUserLocated,
  onReportPointSelect,
  onIncidenciaAction,
  onIncidenciaCommentsOpen,
  route,
  focusUserPositionKey = 0,
  markerVariant = 'urgency',
  className = 'h-64',
}: MapProps) {
  const safeCenter = isValidLatLng(center) ? center : VALENCIA
  const safeUserPosition = isValidLatLng(userPosition) ? userPosition : null
  const safeReportPoint = isValidLatLng(reportPoint) ? reportPoint : null
  const safePuestos = puestos.filter(hasValidMarkerPosition)
  const safeIncidencias = incidencias.filter(hasValidMarkerPosition)
  const safeRoute = route?.filter(isValidLatLng) ?? null
  const selectedPuesto = safePuestos.find((p) => p.id === selectedPuestoId)

  return (
    <div className={className}>
      <MapContainer
        center={safeCenter}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        {/* Ruta — polyline azul */}
        {safeRoute && safeRoute.length > 1 && (
          <>
            <Polyline
              positions={safeRoute}
              pathOptions={{ color: '#3b82f6', weight: 5, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }}
            />
            <FitRoute points={safeRoute} />
          </>
        )}

        {/* Fly al puesto seleccionado (solo cuando no hay ruta activa) */}
        {!safeRoute && selectedPuesto && (
          <FlyTo position={[selectedPuesto.latitud, selectedPuesto.longitud]} zoom={16} />
        )}

        {/* Marcador de usuario */}
        {safeUserPosition && (
          <Marker position={safeUserPosition} icon={userIcon()}>
            <Popup>
              <span style={{ fontWeight: 600 }}>Tu ubicación</span>
            </Popup>
          </Marker>
        )}

        {safeUserPosition && focusUserPositionKey > 0 && (
          <FocusUserPosition position={safeUserPosition} triggerKey={focusUserPositionKey} />
        )}

        {/* Punto de incidencia seleccionado */}
        {safeReportPoint && (
          <Marker position={safeReportPoint} icon={reportIcon()}>
            <Tooltip permanent direction="top" offset={[0, -12]} opacity={1}>
              Punto de incidencia
            </Tooltip>
            <Popup>
              <div style={{ minWidth: 190, maxWidth: 230 }}>
                <p style={{ fontWeight: 700, marginBottom: 4 }}>Nuevo reporte</p>
                <p style={{ fontSize: 12, color: '#6b7280' }}>Este punto se enviará como ubicación de la incidencia.</p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Incidencias reportadas */}
        {safeIncidencias.map((inc) => (
          <Marker
            key={inc.id}
            position={[inc.latitud, inc.longitud]}
            icon={incidenciaIcon(inc.estado, inc.pendingSync)}
            interactive={!selectingReportPoint}
          >
            <Popup maxWidth={210} minWidth={170} autoPanPadding={[18, 18]}>
              <div style={{ width: 175 }}>
                <p style={{ fontWeight: 700, marginBottom: 6, color: '#111827' }}>
                  {inc.estado === 'CORTADA' ? 'Calle cortada' : 'Incidencia resuelta'}
                </p>
                {inc.pendingSync && (
                  <p style={{ fontSize: 12, color: '#92400e', marginBottom: 6 }}>Pendiente de sincronizar</p>
                )}
                {inc._count?.comentarios ? (
                  <p style={{ fontSize: 12, color: '#2563eb', marginBottom: 6 }}>
                    {inc._count.comentarios} comentario{inc._count.comentarios === 1 ? '' : 's'}
                  </p>
                ) : null}
                {inc.descripcion && !inc.comentarios?.[0] && (
                  <p
                    style={{
                      fontSize: 12,
                      color: '#374151',
                      marginBottom: 6,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {inc.descripcion}
                  </p>
                )}
                {inc.comentarios?.[0] && (
                  <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 8, paddingTop: 8, marginBottom: 8 }}>
                    <p style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, marginBottom: 3 }}>
                      Último comentario
                    </p>
                    <p style={{
                      fontSize: 12,
                      color: '#374151',
                      marginBottom: 3,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}>
                      {inc.comentarios[0].comentario}
                    </p>
                    <p style={{ fontSize: 11, color: '#6b7280' }}>
                      {inc.comentarios[0].estado === 'CORTADA' ? 'Sigue cortada' : 'Resuelta'} · {new Date(inc.comentarios[0].createdAt).toLocaleString('es-ES')}
                    </p>
                    {(inc._count?.comentarios ?? inc.comentarios.length) > 1 && onIncidenciaCommentsOpen && (
                      <button
                        type="button"
                        onClick={() => onIncidenciaCommentsOpen(inc)}
                        style={{
                          marginTop: 6,
                          border: '0',
                          background: 'transparent',
                          color: '#2563eb',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 700,
                          padding: 0,
                        }}
                      >
                        Ver todos
                      </button>
                    )}
                  </div>
                )}
                <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>
                  {inc.latitud.toFixed(5)}, {inc.longitud.toFixed(5)}
                </p>
                {inc.createdAt && (
                  <p style={{ fontSize: 12, color: '#9ca3af' }}>
                    {new Date(inc.createdAt).toLocaleString('es-ES')}
                  </p>
                )}
                {!inc.pendingSync && onIncidenciaAction && (
                  <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={() => onIncidenciaAction(inc, 'comentar')}
                      style={{
                        border: '1px solid #d1d5db',
                        borderRadius: 8,
                        background: '#ffffff',
                        color: '#374151',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 700,
                        padding: '7px 8px',
                        textAlign: 'center',
                      }}
                    >
                      Actualizar / comentar
                    </button>
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Marcadores de puestos */}
        {safePuestos.map((p) => (
          <Marker
            key={p.id}
            position={[p.latitud, p.longitud]}
            icon={puestoIcon(p.necesidades, p.id === selectedPuestoId, markerVariant)}
            interactive={!selectingReportPoint}
            eventHandlers={{ click: () => !selectingReportPoint && onPuestoSelect?.(p.id) }}
          >
            <Popup>
              <div style={{ minWidth: 170 }}>
                <p style={{ fontWeight: 700, marginBottom: 2, color: '#111827' }}>{p.nombre}</p>
                <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{p.direccion}</p>
                {p.distanciaKm !== undefined && (
                  <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>{p.distanciaKm.toFixed(1)} km</p>
                )}
                {p.necesidades > 0 && (
                  <p style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, marginBottom: 8 }}>
                    ⚠️ {p.necesidades} necesidad{p.necesidades > 1 ? 'es' : ''} urgente{p.necesidades > 1 ? 's' : ''}
                  </p>
                )}
                {onVerInventarioPuesto && (
                  <button
                    type="button"
                    onClick={() => onVerInventarioPuesto(p.id)}
                    style={{
                      width: '100%',
                      marginTop: 4,
                      padding: '7px 10px',
                      border: '1px solid #3b82f6',
                      borderRadius: 8,
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                      textAlign: 'center',
                    }}
                  >
                    📦 Ver inventario
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        <ReportPointSelector
          enabled={selectingReportPoint}
          onSelect={(pos) => onReportPointSelect?.(pos)}
        />

        {onUserLocated && <LocateButton onLocated={onUserLocated} />}

      </MapContainer>
    </div>
  )
}
