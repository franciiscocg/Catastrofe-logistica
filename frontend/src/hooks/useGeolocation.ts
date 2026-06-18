import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

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
  permissionState: PermissionState | 'unsupported' | null
}

type GeolocationContextValue = GeolocationState & {
  request: () => void
  isWatching: boolean
}

const GEOLOCATION_STORAGE_KEY = 'catastrofe-logistica:last-geolocation'
const GEOLOCATION_ERROR_INSECURE =
  'Safari en iPhone solo permite ubicacion en HTTPS. Abre la app desde una URL https o localhost.'
const GEOLOCATION_ERROR_PROMPT =
  'Pulsa Activar ubicacion para permitir el acceso desde Safari.'
const HIGH_ACCURACY_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 12000,
  maximumAge: 0,
}
const RELAXED_ACCURACY_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 20000,
  maximumAge: 60000,
}

const GeolocationContext = createContext<GeolocationContextValue | null>(null)

function isLocalhost() {
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
}

function isSecureGeolocationOrigin() {
  return window.isSecureContext || isLocalhost()
}

function isIOSWebKit() {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

function parseStoredPosition(): GeoPosition | null {
  try {
    const raw = sessionStorage.getItem(GEOLOCATION_STORAGE_KEY)
    if (!raw) return null

    const position = JSON.parse(raw) as GeoPosition
    if (
      typeof position.lat !== 'number' ||
      typeof position.lng !== 'number' ||
      typeof position.accuracy !== 'number' ||
      typeof position.timestamp !== 'number'
    ) {
      return null
    }

    return position
  } catch {
    return null
  }
}

function toGeoPosition(pos: GeolocationPosition): GeoPosition {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    timestamp: pos.timestamp,
  }
}

function savePosition(position: GeoPosition) {
  try {
    sessionStorage.setItem(GEOLOCATION_STORAGE_KEY, JSON.stringify(position))
  } catch {
    // La ubicacion en memoria sigue funcionando aunque el navegador bloquee sessionStorage.
  }
}

export function GeolocationProvider({ children }: { children: ReactNode }) {
  const watchIdRef = useRef<number | null>(null)
  const [state, setState] = useState<GeolocationState>(() => ({
    position: parseStoredPosition(),
    error: null,
    loading: false,
    permissionState: null,
  }))

  const onSuccess = useCallback((pos: GeolocationPosition) => {
    const position = toGeoPosition(pos)
    savePosition(position)
    setState({
      position,
      error: null,
      loading: false,
      permissionState: 'granted',
    })
  }, [])

  const onError = useCallback((err: GeolocationPositionError) => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
    }
    watchIdRef.current = null
    setState((prev) => ({
      ...prev,
      error: err.code === err.PERMISSION_DENIED
        ? 'La ubicacion esta bloqueada en el navegador'
        : err.message,
      loading: false,
      permissionState: err.code === err.PERMISSION_DENIED ? 'denied' : prev.permissionState,
    }))
  }, [])

  const getCurrentPosition = useCallback((onCurrentPosition: PositionCallback) => {
    navigator.geolocation.getCurrentPosition(
      onCurrentPosition,
      (err) => {
        if (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE) {
          navigator.geolocation.getCurrentPosition(onCurrentPosition, onError, RELAXED_ACCURACY_OPTIONS)
          return
        }
        onError(err)
      },
      HIGH_ACCURACY_OPTIONS,
    )
  }, [onError])

  const startWatching = useCallback((forceRestart = false, requestCurrentPosition = false) => {
    if (!navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        error: 'Geolocalizacion no disponible en este dispositivo',
        loading: false,
        permissionState: 'unsupported',
      }))
      return
    }

    if (!isSecureGeolocationOrigin()) {
      setState((prev) => ({
        ...prev,
        error: GEOLOCATION_ERROR_INSECURE,
        loading: false,
        permissionState: 'unsupported',
      }))
      return
    }

    if (forceRestart && watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }

    if (watchIdRef.current !== null) {
      setState((prev) => ({ ...prev, loading: !prev.position }))
      return
    }

    setState((prev) => ({
      ...prev,
      error: null,
      loading: !prev.position,
      permissionState: prev.permissionState === 'denied' ? null : prev.permissionState,
    }))

    if (requestCurrentPosition) {
      getCurrentPosition((pos) => {
        onSuccess(pos)
        startWatching(false, false)
      })
      return
    }

    watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 10000,
    })
  }, [getCurrentPosition, onError, onSuccess])

  useEffect(() => {
    if (!isSecureGeolocationOrigin()) {
      setState((prev) => ({
        ...prev,
        error: GEOLOCATION_ERROR_INSECURE,
        permissionState: 'unsupported',
      }))
      return
    }

    if (isIOSWebKit() && !state.position) {
      setState((prev) => ({
        ...prev,
        error: prev.error ?? GEOLOCATION_ERROR_PROMPT,
        permissionState: prev.permissionState ?? 'prompt',
      }))
      return
    }

    startWatching()

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [startWatching, state.position])

  useEffect(() => {
    if (!isSecureGeolocationOrigin()) return

    if (!navigator.permissions?.query) {
      setState((prev) => ({
        ...prev,
        permissionState: prev.permissionState ?? (isIOSWebKit() ? 'prompt' : 'unsupported'),
      }))
      return
    }

    let cancelled = false
    let permissionStatus: PermissionStatus | null = null

    void navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (cancelled) return
        permissionStatus = status
        setState((prev) => ({
          ...prev,
          error: status.state === 'granted' ? null : (prev.error ?? GEOLOCATION_ERROR_PROMPT),
          permissionState: status.state,
        }))
        if (status.state === 'granted') startWatching(false, true)
        status.onchange = () => {
          setState((prev) => ({
            ...prev,
            error: status.state === 'granted' ? null : prev.error,
            permissionState: status.state,
          }))
          if (status.state === 'granted') startWatching(true, true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            permissionState: prev.permissionState ?? (isIOSWebKit() ? 'prompt' : 'unsupported'),
          }))
        }
      })

    return () => {
      cancelled = true
      if (permissionStatus) permissionStatus.onchange = null
    }
  }, [startWatching])

  const value = useMemo<GeolocationContextValue>(() => ({
    ...state,
    request: () => startWatching(true, true),
    isWatching: watchIdRef.current !== null,
  }), [startWatching, state])

  return createElement(GeolocationContext.Provider, { value }, children)
}

function useStandaloneGeolocation(watch = false): GeolocationContextValue {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    error: null,
    loading: false,
    permissionState: null,
  })

  const onSuccess = useCallback((pos: GeolocationPosition) => {
    setState({
      position: toGeoPosition(pos),
      error: null,
      loading: false,
      permissionState: 'granted',
    })
  }, [])

  const onError = useCallback((err: GeolocationPositionError) => {
    setState((prev) => ({
      ...prev,
      error: err.code === err.PERMISSION_DENIED
        ? 'La ubicacion esta bloqueada en el navegador'
        : err.message,
      loading: false,
      permissionState: err.code === err.PERMISSION_DENIED ? 'denied' : prev.permissionState,
    }))
  }, [])

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        error: 'Geolocalizacion no disponible en este dispositivo',
        loading: false,
        permissionState: 'unsupported',
      }))
      return
    }
    if (!isSecureGeolocationOrigin()) {
      setState((prev) => ({
        ...prev,
        error: GEOLOCATION_ERROR_INSECURE,
        loading: false,
        permissionState: 'unsupported',
      }))
      return
    }
    setState((prev) => ({
      ...prev,
      error: null,
      loading: true,
      permissionState: prev.permissionState === 'denied' ? null : prev.permissionState,
    }))
    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (err) => {
        if (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE) {
          navigator.geolocation.getCurrentPosition(onSuccess, onError, RELAXED_ACCURACY_OPTIONS)
          return
        }
        onError(err)
      },
      HIGH_ACCURACY_OPTIONS,
    )
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

  return { ...state, request, isWatching: watch }
}

export function useGeolocation(watch = false) {
  const globalGeolocation = useContext(GeolocationContext)
  const standaloneGeolocation = useStandaloneGeolocation(watch)

  return globalGeolocation ?? standaloneGeolocation
}
