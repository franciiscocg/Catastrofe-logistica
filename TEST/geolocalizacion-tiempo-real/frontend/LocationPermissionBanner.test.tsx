import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock del hook de geolocalización ─────────────────────────────────────────
// Se mockea el módulo completo para controlar el estado que recibe el banner.

vi.mock('../../../frontend/src/hooks/useGeolocation', () => ({
  useGeolocation: vi.fn(),
}))

import { useGeolocation } from '../../../frontend/src/hooks/useGeolocation'
import LocationPermissionBanner from '../../../frontend/src/components/layout/LocationPermissionBanner'
import type { GeoPosition } from '../../../frontend/src/hooks/useGeolocation'

const mockUseGeolocation = useGeolocation as ReturnType<typeof vi.fn>

const MOCK_POS: GeoPosition = { lat: 39.4254, lng: -0.4178, accuracy: 10, timestamp: 1000 }

function setup(overrides: Partial<{
  position: GeoPosition | null
  error: string | null
  loading: boolean
  permissionState: PermissionState | 'unsupported' | null
  request: () => void
  isWatching: boolean
}> = {}) {
  mockUseGeolocation.mockReturnValue({
    position: null,
    error: null,
    loading: false,
    permissionState: null,
    request: vi.fn(),
    isWatching: false,
    ...overrides,
  })
}

// ── Suite 1: Condiciones de visibilidad ───────────────────────────────────────

describe('LocationPermissionBanner — visibilidad', () => {
  beforeEach(() => vi.clearAllMocks())

  it('no se renderiza cuando hay posición (ubicación disponible)', () => {
    setup({ position: MOCK_POS, error: 'err' })
    const { container } = render(<LocationPermissionBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('no se renderiza cuando está cargando aunque haya error', () => {
    setup({ loading: true, error: 'err' })
    const { container } = render(<LocationPermissionBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('no se renderiza cuando no hay error', () => {
    setup({ error: null })
    const { container } = render(<LocationPermissionBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('se renderiza cuando hay error, no hay posición y no está cargando', () => {
    setup({ error: 'La ubicacion esta bloqueada en el navegador', permissionState: 'denied' })
    render(<LocationPermissionBanner />)
    expect(screen.getByRole('button', { name: 'Activar ubicacion' })).toBeInTheDocument()
  })
})

// ── Suite 2: Mensaje según el tipo de error ───────────────────────────────────

describe('LocationPermissionBanner — mensajes de estado', () => {
  beforeEach(() => vi.clearAllMocks())

  it('muestra "Ubicacion bloqueada" cuando permissionState es "denied"', () => {
    setup({ error: 'La ubicacion esta bloqueada en el navegador', permissionState: 'denied' })
    render(<LocationPermissionBanner />)
    expect(screen.getByText('Ubicacion bloqueada')).toBeInTheDocument()
  })

  it('muestra "Ubicacion desactivada" cuando permissionState no es "denied"', () => {
    setup({ error: 'Geolocalizacion no disponible en este dispositivo', permissionState: 'unsupported' })
    render(<LocationPermissionBanner />)
    expect(screen.getByText('Ubicacion desactivada')).toBeInTheDocument()
  })

  it('muestra "Ubicacion desactivada" cuando permissionState es null', () => {
    setup({ error: 'Error generico', permissionState: null })
    render(<LocationPermissionBanner />)
    expect(screen.getByText('Ubicacion desactivada')).toBeInTheDocument()
  })

  it('incluye instrucciones para activar el permiso desde el icono del navegador cuando está bloqueada', () => {
    setup({ error: 'err', permissionState: 'denied' })
    render(<LocationPermissionBanner />)
    expect(screen.getByText(/permisos del navegador/i)).toBeInTheDocument()
  })

  it('indica para qué sirve la ubicación cuando está desactivada', () => {
    setup({ error: 'err', permissionState: 'granted' })
    render(<LocationPermissionBanner />)
    expect(screen.getByText(/ordenar puestos/i)).toBeInTheDocument()
  })
})

// ── Suite 3: Interacción ──────────────────────────────────────────────────────

describe('LocationPermissionBanner — interacción', () => {
  beforeEach(() => vi.clearAllMocks())

  it('el botón "Activar ubicacion" llama a request() al ser pulsado', () => {
    const mockRequest = vi.fn()
    setup({ error: 'err', permissionState: 'denied', request: mockRequest })
    render(<LocationPermissionBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Activar ubicacion' }))
    expect(mockRequest).toHaveBeenCalledOnce()
  })

  it('el botón no llama a request() si no se pulsa', () => {
    const mockRequest = vi.fn()
    setup({ error: 'err', permissionState: 'denied', request: mockRequest })
    render(<LocationPermissionBanner />)
    expect(mockRequest).not.toHaveBeenCalled()
  })
})

// ── Suite 4: Aviso persistente ────────────────────────────────────────────────

describe('LocationPermissionBanner — persistencia visual', () => {
  beforeEach(() => vi.clearAllMocks())

  it('el banner tiene clase "fixed" para quedar anclado mientras la ubicación esté bloqueada', () => {
    setup({ error: 'err', permissionState: 'denied' })
    render(<LocationPermissionBanner />)
    const btn = screen.getByRole('button', { name: 'Activar ubicacion' })
    // closest('[class]') devuelve el botón mismo (que tiene clases propias).
    // Usamos [class*="fixed"] para subir hasta el div ancestro que contiene "fixed".
    const banner = btn.closest('[class*="fixed"]')
    expect(banner).not.toBeNull()
    expect(banner?.className).toMatch(/fixed/)
  })

  it('el banner tiene z-index elevado para mostrarse por encima del mapa', () => {
    setup({ error: 'err', permissionState: 'denied' })
    render(<LocationPermissionBanner />)
    const btn = screen.getByRole('button', { name: 'Activar ubicacion' })
    // z-[3000] garantiza que el banner supera el z-index del mapa (z-1000)
    const banner = btn.closest('[class*="z-[3000]"]')
    expect(banner).not.toBeNull()
  })
})
