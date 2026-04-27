import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet'
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

interface MapProps {
  center?: [number, number]
  zoom?: number
  userPosition?: [number, number] | null
  puestos?: PuestoMarker[]
  selectedPuestoId?: string | null
  onPuestoSelect?: (id: string) => void
  onUserLocated?: (pos: [number, number]) => void
  route?: [number, number][] | null
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

// ── Componente principal ──────────────────────────────────────────────────────

const VALENCIA: [number, number] = [39.4250, -0.4000]

export default function Map({
  center = VALENCIA,
  zoom = 13,
  userPosition,
  puestos = [],
  selectedPuestoId,
  onPuestoSelect,
  onUserLocated,
  route,
  markerVariant = 'urgency',
  className = 'h-64',
}: MapProps) {
  const selectedPuesto = puestos.find((p) => p.id === selectedPuestoId)

  return (
    <div className={className}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        {/* Ruta — polyline azul */}
        {route && route.length > 1 && (
          <>
            <Polyline
              positions={route}
              pathOptions={{ color: '#3b82f6', weight: 5, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }}
            />
            <FitRoute points={route} />
          </>
        )}

        {/* Fly al puesto seleccionado (solo cuando no hay ruta activa) */}
        {!route && selectedPuesto && (
          <FlyTo position={[selectedPuesto.latitud, selectedPuesto.longitud]} zoom={16} />
        )}

        {/* Marcador de usuario */}
        {userPosition && (
          <Marker position={userPosition} icon={userIcon()}>
            <Popup>
              <span style={{ fontWeight: 600 }}>Tu ubicación</span>
            </Popup>
          </Marker>
        )}

        {/* Marcadores de puestos */}
        {puestos.map((p) => (
          <Marker
            key={p.id}
            position={[p.latitud, p.longitud]}
            icon={puestoIcon(p.necesidades, p.id === selectedPuestoId, markerVariant)}
            eventHandlers={{ click: () => onPuestoSelect?.(p.id) }}
          >
            <Popup>
              <div style={{ minWidth: 160 }}>
                <p style={{ fontWeight: 600, marginBottom: 2 }}>{p.nombre}</p>
                <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{p.direccion}</p>
                {p.distanciaKm !== undefined && (
                  <p style={{ fontSize: 12, color: '#9ca3af' }}>{p.distanciaKm.toFixed(1)} km</p>
                )}
                {p.necesidades > 0 && (
                  <p style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, marginTop: 4 }}>
                    ⚠️ {p.necesidades} necesidad{p.necesidades > 1 ? 'es' : ''} urgente{p.necesidades > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        <LocateButton onLocated={(pos) => onUserLocated?.(pos)} />
      </MapContainer>
    </div>
  )
}
