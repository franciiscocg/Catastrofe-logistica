import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../frontend/src/hooks/useGeolocation', () => ({
  useGeolocation: () => ({
    position: null,
    error: 'La ubicación está bloqueada en el navegador',
    loading: false,
    permissionState: 'denied',
    request: vi.fn(),
  }),
}))

import LocationPermissionBanner from '../../../frontend/src/components/layout/LocationPermissionBanner'

describe('consulta publica sin geolocalizacion', () => {
  it('no muestra permisos de ubicación en /verificar', () => {
    window.history.pushState({}, '', '/verificar/don-1')

    const { container } = render(<LocationPermissionBanner />)

    expect(container).toBeEmptyDOMElement()
  })
})
