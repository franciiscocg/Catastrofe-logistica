import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks hoisted ─────────────────────────────────────────────────────────────

const {
  mockNavigate,
  mockLogin,
  mockLogout,
  mockSelectRole,
  mockApiGet,
  mockApiPost,
  mockAuthState,
} = vi.hoisted(() => ({
  mockNavigate:   vi.fn(),
  mockLogin:      vi.fn(),
  mockLogout:     vi.fn(),
  mockSelectRole: vi.fn(),
  mockApiGet:     vi.fn(),
  mockApiPost:    vi.fn(),
  mockAuthState: {
    isAuthenticated: true,
    selectedRole:    null,
    user:            null as null | { id: string; email: string; nombre: string; apellidos: string; roles: string[] },
    puestoId:        undefined as string | undefined,
  },
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../../frontend/src/store/auth.store', () => ({
  useAuthStore: vi.fn(() => ({
    ...mockAuthState,
    login:      mockLogin,
    logout:     mockLogout,
    selectRole: mockSelectRole,
    setPuestoId: vi.fn(),
    updateUser: vi.fn(),
  })),
}))

vi.mock('../../../frontend/src/hooks/useGeolocation', () => ({
  useGeolocation: vi.fn(() => ({
    position: null,
    loading:  false,
    request:  vi.fn(),
  })),
  GeolocationProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../frontend/src/components/shared/Map', () => ({
  default: () => <div data-testid="map" />,
}))

vi.mock('../../../frontend/src/lib/api/client', () => ({
  apiClient: {
    get:   mockApiGet,
    post:  mockApiPost,
  },
}))

import RegisterPuesto from '../../../frontend/src/features/auth/pages/RegisterPuesto'
import RoleSelection  from '../../../frontend/src/features/auth/pages/RoleSelection'
import CoordinadorDashboard from '../../../frontend/src/features/coordinador/pages/Dashboard'

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  )
}

function setUser(roles: string[] = ['CIUDADANO', 'VOLUNTARIO']) {
  mockAuthState.isAuthenticated = true
  mockAuthState.user = {
    id: 'user-1', email: 'maria@example.com', nombre: 'Maria', apellidos: 'Garcia', roles,
  }
}

// ── RegisterPuesto ────────────────────────────────────────────────────────────

describe('RegisterPuesto — estado sin solicitud previa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setUser()
    mockApiGet.mockResolvedValue({ data: { solicitud: null } })
  })

  it('muestra el formulario de registro cuando no hay solicitud', async () => {
    renderWithQuery(<RegisterPuesto />)
    expect(await screen.findByText('Registrar puesto de emergencia')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/CEIP La Paz/)).toBeInTheDocument()
  })

  it('envia los datos correctos al enviar el formulario', async () => {
    mockApiPost.mockResolvedValue({ data: { solicitud: { id: 'solicitud-1' } } })
    renderWithQuery(<RegisterPuesto />)

    await screen.findByText('Registrar puesto de emergencia')

    fireEvent.change(screen.getByPlaceholderText(/CEIP La Paz/), { target: { value: 'CEIP La Paz' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'colegio' } })
    fireEvent.change(screen.getByPlaceholderText(/Calle Mayor/), { target: { value: 'Calle Mayor 12' } })
    fireEvent.change(screen.getByPlaceholderText('39.4254'), { target: { value: '39.4254' } })
    fireEvent.change(screen.getByPlaceholderText('-0.4178'), { target: { value: '-0.4178' } })

    fireEvent.click(screen.getByRole('button', { name: /Enviar solicitud/i }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/puestos/solicitudes', {
        nombre:     'CEIP La Paz',
        tipo:       'colegio',
        direccion:  'Calle Mayor 12',
        descripcion: undefined,
        latitud:    39.4254,
        longitud:   -0.4178,
      })
    })
  })

  it('muestra errores de validacion si se envia con campos vacios', async () => {
    renderWithQuery(<RegisterPuesto />)
    await screen.findByText('Registrar puesto de emergencia')

    fireEvent.click(screen.getByRole('button', { name: /Enviar solicitud/i }))

    await waitFor(() => {
      expect(screen.getByText('El nombre del puesto es obligatorio')).toBeInTheDocument()
    })
    expect(mockApiPost).not.toHaveBeenCalled()
  })
})

describe('RegisterPuesto — solicitud PENDIENTE', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setUser(['CIUDADANO', 'PUESTO_EMERGENCIA'])
    mockApiGet.mockResolvedValue({
      data: {
        solicitud: {
          id: 'solicitud-1', nombre: 'CEIP La Paz', tipo: 'colegio',
          direccion: 'Calle Mayor 12', descripcion: null,
          latitud: 39.4254, longitud: -0.4178,
          estado: 'PENDIENTE', createdAt: '2026-05-10T10:00:00.000Z',
        },
      },
    })
  })

  it('muestra el estado de espera con los datos de la solicitud', async () => {
    renderWithQuery(<RegisterPuesto />)

    expect(await screen.findByText('En espera de aprobacion')).toBeInTheDocument()
    // El nombre aparece varias veces (en el texto y en el resumen); la direccion es unica
    expect(screen.getAllByText('CEIP La Paz').length).toBeGreaterThan(0)
    expect(screen.getByText('Calle Mayor 12')).toBeInTheDocument()
  })

  it('no muestra el formulario de envio mientras esta PENDIENTE', async () => {
    renderWithQuery(<RegisterPuesto />)

    await screen.findByText('En espera de aprobacion')
    expect(screen.queryByRole('button', { name: /Enviar solicitud/i })).not.toBeInTheDocument()
  })
})

describe('RegisterPuesto — solicitud RECHAZADA', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setUser(['CIUDADANO', 'PUESTO_EMERGENCIA'])
    mockApiGet.mockResolvedValue({
      data: {
        solicitud: {
          id: 'solicitud-1', nombre: 'CEIP La Paz', tipo: 'colegio',
          direccion: 'Calle Mayor 12', descripcion: null,
          latitud: 39.4254, longitud: -0.4178,
          estado: 'RECHAZADA',
          motivoRechazo: 'Falta documentacion del responsable',
          createdAt: '2026-05-09T10:00:00.000Z',
        },
      },
    })
  })

  it('muestra el estado de rechazo con el motivo', async () => {
    renderWithQuery(<RegisterPuesto />)

    expect(await screen.findByText('Solicitud rechazada')).toBeInTheDocument()
    expect(screen.getByText('Falta documentacion del responsable')).toBeInTheDocument()
  })

  it('muestra el boton para enviar nueva solicitud', async () => {
    renderWithQuery(<RegisterPuesto />)

    expect(await screen.findByRole('button', { name: /Enviar nueva solicitud/i })).toBeInTheDocument()
  })

  it('al pulsar "Enviar nueva solicitud" muestra el formulario', async () => {
    renderWithQuery(<RegisterPuesto />)

    await screen.findByText('Solicitud rechazada')
    fireEvent.click(screen.getByRole('button', { name: /Enviar nueva solicitud/i }))

    expect(await screen.findByText('Registrar puesto de emergencia')).toBeInTheDocument()
  })

  it('al enviar la nueva solicitud llama al endpoint correcto', async () => {
    mockApiPost.mockResolvedValue({ data: { solicitud: { id: 'solicitud-2' } } })
    renderWithQuery(<RegisterPuesto />)

    await screen.findByText('Solicitud rechazada')
    fireEvent.click(screen.getByRole('button', { name: /Enviar nueva solicitud/i }))

    await screen.findByText('Registrar puesto de emergencia')

    fireEvent.change(screen.getByPlaceholderText(/CEIP La Paz/), { target: { value: 'CEIP La Paz' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'colegio' } })
    fireEvent.change(screen.getByPlaceholderText(/Calle Mayor/), { target: { value: 'Calle Mayor 12' } })
    fireEvent.change(screen.getByPlaceholderText('39.4254'), { target: { value: '39.4254' } })
    fireEvent.change(screen.getByPlaceholderText('-0.4178'), { target: { value: '-0.4178' } })
    fireEvent.click(screen.getByRole('button', { name: /^Enviar solicitud$/i }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/puestos/solicitudes', expect.objectContaining({
        nombre: 'CEIP La Paz', tipo: 'colegio',
      }))
    })
  })
})

describe('RegisterPuesto — solicitud ACEPTADA', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setUser(['CIUDADANO', 'PUESTO_EMERGENCIA'])
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/api/puestos/mio') {
        return Promise.resolve({ data: { puestos: [{ id: 'puesto-1' }] } })
      }
      return Promise.resolve({
        data: {
          solicitud: {
            id: 'solicitud-1', nombre: 'CEIP La Paz', estado: 'ACEPTADA',
            tipo: 'colegio', direccion: 'Calle Mayor 12',
            latitud: 39.4254, longitud: -0.4178, createdAt: '2026-05-09T10:00:00.000Z',
          },
        },
      })
    })
  })

  it('redirige a /puesto cuando la solicitud ha sido aceptada', async () => {
    renderWithQuery(<RegisterPuesto />)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/puesto', { replace: true })
    })
  })
})

// ── RoleSelection ─────────────────────────────────────────────────────────────

describe('RoleSelection — seleccion de rol', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setUser()
    mockApiGet.mockResolvedValue({ data: { solicitud: null } })
  })

  it('muestra las tarjetas de los tres roles disponibles', () => {
    renderWithQuery(<RoleSelection />)

    expect(screen.getByText('Ciudadano')).toBeInTheDocument()
    expect(screen.getByText('Voluntario')).toBeInTheDocument()
    expect(screen.getByText('Puesto de Emergencia')).toBeInTheDocument()
  })

  it('al seleccionar Puesto de Emergencia navega a /auth/registro-puesto', () => {
    renderWithQuery(<RoleSelection />)

    fireEvent.click(screen.getByText('Puesto de Emergencia'))

    expect(mockSelectRole).toHaveBeenCalledWith('puesto')
    expect(mockNavigate).toHaveBeenCalledWith('/auth/registro-puesto')
  })

  it('NO navega directamente a /puesto aunque el usuario ya tenga el rol PUESTO_EMERGENCIA', () => {
    setUser(['CIUDADANO', 'VOLUNTARIO', 'PUESTO_EMERGENCIA'])
    renderWithQuery(<RoleSelection />)

    fireEvent.click(screen.getByText('Puesto de Emergencia'))

    expect(mockNavigate).toHaveBeenCalledWith('/auth/registro-puesto')
    expect(mockNavigate).not.toHaveBeenCalledWith('/puesto')
  })

  it('al seleccionar Ciudadano navega a /ciudadano', () => {
    renderWithQuery(<RoleSelection />)

    fireEvent.click(screen.getByText('Ciudadano'))

    expect(mockSelectRole).toHaveBeenCalledWith('ciudadano')
    expect(mockNavigate).toHaveBeenCalledWith('/ciudadano')
  })

  it('muestra el nombre del usuario autenticado', () => {
    renderWithQuery(<RoleSelection />)

    expect(screen.getByText(/Maria/)).toBeInTheDocument()
  })
})

// ── CoordinadorDashboard ──────────────────────────────────────────────────────

describe('CoordinadorDashboard — gestion de solicitudes', () => {
  const solicitudPendiente = {
    id: 'solicitud-1', nombre: 'CEIP La Paz', tipo: 'colegio',
    direccion: 'Calle Mayor 12', descripcion: null,
    latitud: 39.4254, longitud: -0.4178,
    estado: 'PENDIENTE', motivoRechazo: null,
    createdAt: '2026-05-10T10:00:00.000Z',
    usuario: {
      nombre: 'Maria', apellidos: 'Garcia',
      email: 'maria@example.com', telefono: null, dni: '12345678A',
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setUser(['COORDINADOR'])
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/api/puestos/solicitudes') {
        return Promise.resolve({ data: { solicitudes: [solicitudPendiente] } })
      }
      if (url === '/api/puestos/coordinador') {
        return Promise.resolve({ data: { puestos: [] } })
      }
      return Promise.resolve({ data: {} })
    })
    mockApiPost.mockResolvedValue({ data: {} })
  })

  async function abrirSolicitudes() {
    renderWithQuery(<CoordinadorDashboard />)
    fireEvent.click(await screen.findByRole('button', { name: /^Solicitudes$/i }))
  }

  it('muestra las solicitudes pendientes con los datos del solicitante', async () => {
    await abrirSolicitudes()

    expect(await screen.findByText('CEIP La Paz')).toBeInTheDocument()
    // El email aparece como parte de "Solicitante: Maria Garcia - maria@example.com"
    expect(screen.getByText(/maria@example\.com/)).toBeInTheDocument()
    // La direccion de la solicitud tambien se muestra
    expect(screen.getByText('Calle Mayor 12')).toBeInTheDocument()
    expect(screen.getByText(/Solicitada:/)).toBeInTheDocument()
  })

  it('puede aceptar una solicitud pendiente', async () => {
    await abrirSolicitudes()

    await screen.findByText('CEIP La Paz')
    fireEvent.click(screen.getByRole('button', { name: /Aceptar/i }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/puestos/solicitudes/solicitud-1/aceptar')
    })
  })

  it('puede rechazar una solicitud indicando motivo', async () => {
    await abrirSolicitudes()

    await screen.findByText('CEIP La Paz')
    fireEvent.click(screen.getByRole('button', { name: /^Rechazar$/i }))
    fireEvent.change(screen.getByPlaceholderText(/Faltan datos/i), {
      target: { value: 'Falta documentacion del responsable' },
    })
    const rechazarBtns = screen.getAllByRole('button', { name: /^Rechazar$/i })
    fireEvent.click(rechazarBtns[rechazarBtns.length - 1])

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/puestos/solicitudes/solicitud-1/rechazar', {
        motivo: 'Falta documentacion del responsable',
      })
    })
  })

  it('muestra el badge de estado PENDIENTE para las solicitudes sin revisar', async () => {
    await abrirSolicitudes()

    expect(await screen.findByText('Pendiente')).toBeInTheDocument()
  })

  it('muestra solicitudes ya aceptadas con su badge correspondiente', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/api/puestos/solicitudes') {
        return Promise.resolve({
          data: {
            solicitudes: [{
              ...solicitudPendiente,
              estado: 'ACEPTADA',
              decidedAt: '2026-05-10T11:30:00.000Z',
              coordinador: { nombre: 'Laura', apellidos: 'Ruiz' },
            }],
          },
        })
      }
      if (url === '/api/puestos/coordinador') {
        return Promise.resolve({ data: { puestos: [] } })
      }
      return Promise.resolve({ data: {} })
    })
    await abrirSolicitudes()

    expect(await screen.findByText('Aceptada')).toBeInTheDocument()
    expect(screen.getByText(/Resuelta:/)).toHaveTextContent('Laura Ruiz')
    // Las solicitudes aceptadas no muestran botones de accion
    expect(screen.queryByRole('button', { name: /Aceptar/i })).not.toBeInTheDocument()
  })
})
