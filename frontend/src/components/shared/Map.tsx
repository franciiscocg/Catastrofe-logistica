import { useEffect, useRef } from 'react'

interface MapProps {
  center?: [number, number]
  zoom?: number
  className?: string
}

// TODO: Implementar con react-leaflet en Mes 2
export default function Map({ center = [39.47, -0.38], zoom = 13, className = 'h-64' }: MapProps) {
  return (
    <div className={`${className} bg-gray-200 flex items-center justify-center rounded-lg`}>
      <p className="text-gray-500 text-sm">Mapa — pendiente de implementar</p>
    </div>
  )
}
