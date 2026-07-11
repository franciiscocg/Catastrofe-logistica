import { renderHook, act, render } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement } from 'react'
import { GeolocationProvider, useGeolocation, type GeoPosition } from '../../../frontend/src/hooks/useGeolocation'
import type { ReactNode } from 'react'

// ── Constantes ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'catastrofe-logistica:last-geolocation'

const MOCK_RAW_POS = {
  coords: {
    latitude: 39.4254,
    longitude: -0.4178,
    accuracy: 10,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON: () => ({}),
  },
  timestamp: 1000,
  toJSON: () => ({}),
} as GeolocationPosition

// ── Helpers de mock ───────────────────────────────────────────────────────────

type GeoSuccessCb = (pos: GeolocationPosition) => void
type GeoErrorCb  = (err: GeolocationPositionError) => void

function buildGeoError(code: number): GeolocationPositionError {
  return {
    code,
    message: code === 1 ? 'User denied Geolocation' : 'Position unavailable',
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError
}

function createGeoMock() {
  let watchSuccess: GeoSuccessCb | null = null
  let watchError:   GeoErrorCb  | null = null

  const watchPosition = vi.fn((success: GeoSuccessCb, error: GeoErrorCb) => {
    watchSuccess = success
    watchError   = error
    return 42
  })
  const clearWatch         = vi.fn()
  const getCurrentPosition = vi.fn((success: GeoSuccessCb) => success(MOCK_RAW_POS))

  return {
    watchPosition,
    clearWatch,
    getCurrentPosition,
    fireSuccess: ()             => watchSuccess?.(MOCK_RAW_POS),
    fireError:   (code: number) => watchError?.(buildGeoError(code)),
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(GeolocationProvider, null, children)
}

// ── Suite 1: Proveedor global — solicita y mantiene la ubicación ──────────────

describe('GeolocationProvider — solicita y mantiene la ubicación', () => {
  let geo: ReturnType<typeof createGeoMock>

  beforeEach(() => {
    sessionStorage.clear()
    geo = createGeoMock()
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true })
    Object.defineProperty(navigator, 'permissions', {
      value: { query: vi.fn().mockResolvedValue({ state: 'prompt', onchange: null }) },
      configurable: true,
    })
  })

  afterEach(() => vi.clearAllMocks())

  it('llama a watchPosition al montarse el proveedor', () => {
    renderHook(() => useGeolocation(), { wrapper })
    expect(geo.watchPosition).toHaveBeenCalledOnce()
  })

  it('activa enableHighAccuracy: true en el watch', () => {
    renderHook(() => useGeolocation(), { wrapper })
    expect(geo.watchPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ enableHighAccuracy: true }),
    )
  })

  it('actualiza position cuando watchPosition reporta éxito', () => {
    const { result } = renderHook(() => useGeolocation(), { wrapper })
    act(() => geo.fireSuccess())
    expect(result.current.position).toMatchObject({ lat: 39.4254, lng: -0.4178 })
  })

  it('permissionState pasa a "granted" al recibir la primera posición', () => {
    const { result } = renderHook(() => useGeolocation(), { wrapper })
    act(() => geo.fireSuccess())
    expect(result.current.permissionState).toBe('granted')
  })

  it('permissionState pasa a "denied" cuando watchPosition falla con PERMISSION_DENIED', () => {
    const { result } = renderHook(() => useGeolocation(), { wrapper })
    act(() => geo.fireError(1))
    expect(result.current.permissionState).toBe('denied')
  })

  it('el mensaje de error indica que la ubicación está bloqueada al denegar permiso', () => {
    const { result } = renderHook(() => useGeolocation(), { wrapper })
    act(() => geo.fireError(1))
    expect(result.current.error).toMatch(/bloqueada/i)
  })

  it('request() llama a getCurrentPosition con enableHighAccuracy: true', () => {
    const { result } = renderHook(() => useGeolocation(), { wrapper })
    act(() => result.current.request())
    expect(geo.getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ enableHighAccuracy: true }),
    )
  })

  it('limpia el watchId al desmontar el proveedor', () => {
    const { unmount } = renderHook(() => useGeolocation(), { wrapper })
    unmount()
    expect(geo.clearWatch).toHaveBeenCalledWith(42)
  })
})

describe('GeolocationProvider — compatibilidad con Safari', () => {
  beforeEach(() => {
    sessionStorage.clear()
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15',
      configurable: true,
    })
    Object.defineProperty(navigator, 'vendor', { value: 'Apple Computer, Inc.', configurable: true })
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true })
    Object.defineProperty(navigator, 'permissions', { value: undefined, configurable: true })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 Chrome/124.0 Safari/537.36', configurable: true })
    Object.defineProperty(navigator, 'vendor', { value: 'Google Inc.', configurable: true })
  })

  it('no solicita ubicación automáticamente antes de una acción del usuario', async () => {
    const geo = createGeoMock()
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true })
    const { result } = renderHook(() => useGeolocation(), { wrapper })
    await act(async () => {})
    expect(geo.watchPosition).not.toHaveBeenCalled()
    expect(geo.getCurrentPosition).not.toHaveBeenCalled()
    expect(result.current.permissionState).toBe('prompt')
  })

  it('empieza con precisión relajada al pulsar Activar ubicación', () => {
    const geo = createGeoMock()
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true })
    const { result } = renderHook(() => useGeolocation(), { wrapper })
    act(() => result.current.request())
    expect(geo.getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ enableHighAccuracy: false, maximumAge: 60000 }),
    )
    expect(geo.watchPosition).toHaveBeenCalledOnce()
  })

  it('reintenta con alta precisión si Safari no obtiene la posición aproximada', () => {
    const getCurrentPosition = vi.fn()
      .mockImplementationOnce((_success: GeoSuccessCb, error: GeoErrorCb) => error(buildGeoError(3)))
      .mockImplementationOnce((success: GeoSuccessCb) => success(MOCK_RAW_POS))
    const geo = { watchPosition: vi.fn(() => 42), clearWatch: vi.fn(), getCurrentPosition }
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true })
    const { result } = renderHook(() => useGeolocation(), { wrapper })
    act(() => result.current.request())
    expect(getCurrentPosition).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ enableHighAccuracy: true }),
    )
  })
})

// ── Suite 2: Persistencia de sesión ──────────────────────────────────────────

describe('Persistencia de ubicación durante la sesión', () => {
  let geo: ReturnType<typeof createGeoMock>

  beforeEach(() => {
    sessionStorage.clear()
    geo = createGeoMock()
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true })
    Object.defineProperty(navigator, 'permissions', {
      value: { query: vi.fn().mockResolvedValue({ state: 'prompt', onchange: null }) },
      configurable: true,
    })
  })

  afterEach(() => vi.clearAllMocks())

  it('persiste la posición en sessionStorage al recibirla', () => {
    renderHook(() => useGeolocation(), { wrapper })
    act(() => geo.fireSuccess())

    const stored = sessionStorage.getItem(STORAGE_KEY)
    expect(stored).not.toBeNull()
    const parsed: GeoPosition = JSON.parse(stored!)
    expect(parsed.lat).toBe(39.4254)
    expect(parsed.lng).toBe(-0.4178)
    expect(parsed.accuracy).toBe(10)
    expect(parsed.timestamp).toBe(1000)
  })

  it('restaura la posición de sessionStorage al inicializar', () => {
    const saved: GeoPosition = { lat: 1.23, lng: 4.56, accuracy: 5, timestamp: 999 }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved))

    const { result } = renderHook(() => useGeolocation(), { wrapper })
    expect(result.current.position).toEqual(saved)
  })

  it('ignora un valor corrupto en sessionStorage y arranca con posición null', () => {
    sessionStorage.setItem(STORAGE_KEY, 'no-es-json-valido')
    const { result } = renderHook(() => useGeolocation(), { wrapper })
    expect(result.current.position).toBeNull()
  })

  it('ignora un objeto incompleto en sessionStorage (sin lng)', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ lat: 1 }))
    const { result } = renderHook(() => useGeolocation(), { wrapper })
    expect(result.current.position).toBeNull()
  })
})

// ── Suite 3: Ubicación compartida entre pantallas ─────────────────────────────

describe('Ubicación compartida — mismo proveedor global en todas las pantallas', () => {
  let geo: ReturnType<typeof createGeoMock>

  beforeEach(() => {
    sessionStorage.clear()
    geo = createGeoMock()
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true })
    Object.defineProperty(navigator, 'permissions', {
      value: { query: vi.fn().mockResolvedValue({ state: 'prompt', onchange: null }) },
      configurable: true,
    })
  })

  afterEach(() => vi.clearAllMocks())

  it('dos componentes dentro del mismo proveedor reciben exactamente la misma posición', () => {
    let posA: GeoPosition | null = null
    let posB: GeoPosition | null = null

    function ScreenA() { posA = useGeolocation().position; return null }
    function ScreenB() { posB = useGeolocation().position; return null }

    render(
      createElement(GeolocationProvider, null,
        createElement(ScreenA),
        createElement(ScreenB),
      ),
    )

    act(() => geo.fireSuccess())

    expect(posA).not.toBeNull()
    expect(posA).toEqual(posB)
    expect(posA?.lat).toBe(39.4254)
  })

  it('la posición se recupera en una nueva instancia del proveedor via sessionStorage', () => {
    // Primera instancia: recibe y persiste la posición
    const { unmount } = renderHook(() => useGeolocation(), { wrapper })
    act(() => geo.fireSuccess())
    unmount()

    // Segunda instancia: nuevo watch que no resuelve inmediatamente
    const geoSilent = {
      watchPosition: vi.fn(() => 99),
      clearWatch: vi.fn(),
      getCurrentPosition: vi.fn(),
    }
    Object.defineProperty(navigator, 'geolocation', { value: geoSilent, configurable: true })

    const { result } = renderHook(() => useGeolocation(), { wrapper })
    expect(result.current.position).toMatchObject({ lat: 39.4254, lng: -0.4178 })
  })
})

// ── Suite 4: Geolocalización no soportada ─────────────────────────────────────

describe('GeolocationProvider — API de geolocalización no disponible', () => {
  beforeEach(() => {
    sessionStorage.clear()
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'permissions',  { value: undefined, configurable: true })
  })

  afterEach(() => vi.clearAllMocks())

  it('permissionState es "unsupported" cuando el dispositivo no tiene API de geolocalización', async () => {
    const { result } = renderHook(() => useGeolocation(), { wrapper })
    await act(async () => {})
    expect(result.current.permissionState).toBe('unsupported')
  })

  it('el error refleja que la geolocalización no está disponible en el dispositivo', async () => {
    const { result } = renderHook(() => useGeolocation(), { wrapper })
    await act(async () => {})
    expect(result.current.error).toMatch(/no disponible/i)
  })
})

// ── Suite 5: useGeolocation fuera del proveedor — modo standalone ─────────────

describe('useGeolocation sin proveedor — modo standalone', () => {
  let geo: ReturnType<typeof createGeoMock>

  beforeEach(() => {
    sessionStorage.clear()
    geo = createGeoMock()
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true })
  })

  afterEach(() => vi.clearAllMocks())

  it('devuelve position null inicialmente', () => {
    const { result } = renderHook(() => useGeolocation())
    expect(result.current.position).toBeNull()
  })

  it('request() llama a getCurrentPosition en modo standalone', () => {
    const { result } = renderHook(() => useGeolocation())
    act(() => result.current.request())
    expect(geo.getCurrentPosition).toHaveBeenCalled()
  })

  it('watch=true arranca watchPosition en modo standalone', () => {
    renderHook(() => useGeolocation(true))
    expect(geo.watchPosition).toHaveBeenCalledOnce()
  })
})
