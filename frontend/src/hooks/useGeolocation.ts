import { useState, useEffect, useCallback } from 'react'

export interface GeoPosition {
  lat: number
  lng: number
  accuracy: number
  timestamp: number
}

interface GeolocationState {
  position: GeoPosition | null
  error: string | null
  loading: boolean
}

export function useGeolocation(watch = false) {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    error: null,
    loading: false,
  })

  const onSuccess = useCallback((pos: GeolocationPosition) => {
    setState({
      position: {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
      },
      error: null,
      loading: false,
    })
  }, [])

  const onError = useCallback((err: GeolocationPositionError) => {
    setState((prev) => ({ ...prev, error: err.message, loading: false }))
  }, [])

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({ ...prev, error: 'Geolocalización no disponible en este dispositivo' }))
      return
    }
    setState((prev) => ({ ...prev, loading: true }))
    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000,
    })
  }, [onSuccess, onError])

  useEffect(() => {
    if (!watch) return
    if (!navigator.geolocation) return

    setState((prev) => ({ ...prev, loading: true }))
    const id = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 5000,
    })

    return () => navigator.geolocation.clearWatch(id)
  }, [watch, onSuccess, onError])

  return { ...state, request }
}
