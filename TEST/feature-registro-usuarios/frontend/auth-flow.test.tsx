import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockNavigate,
  mockLogin,
  mockLogout,
  mockSelectRole,
  mockApiGet,
  mockApiPost,
  mockApiPatch,
  mockAuthState,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockLogin: vi.fn(),
  mockLogout: vi.fn(),
  mockSelectRole: vi.fn(),
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
  mockApiPatch: vi.fn(),
  mockAuthState: {
    isAuthenticated: false,
    selectedRole: null,
    user: null as null | { id: string; email: string; nombre: string; apellidos: string; roles: string[] },
    puestoId: undefined as string | undefined,
  },
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../../frontend/src/store/auth.store', () => ({
  useAuthStore: vi.fn(() => ({
    ...mockAuthState,
    login: mockLogin,
    logout: mockLogout,
    selectRole: mockSelectRole,
  })),
}))

vi.mock('../../../frontend/src/hooks/useGeolocation', () => ({
  useGeolocation: vi.fn(() => ({
    position: { lat: 39.4254, lng: -0.4178 },
    loading: false,
    request: vi.fn(),
  })),
}))

vi.mock('../../../frontend/src/components/shared/Map', () => ({
  default: () => <div data-testid="map" />,
}))

vi.mock('../../../frontend/src/lib/api/client', () => ({
  apiClient: {
    get: mockApiGet,
    post: mockApiPost,
    patch: mockApiPatch,
  },
}))

import Welcome from '../../../frontend/src/features/auth/pages/Welcome'
import Login from '../../../frontend/src/features/auth/pages/Login'
import Register from '../../../frontend/src/features/auth/pages/Register'
import RegisterPuesto from '../../../frontend/src/features/auth/pages/RegisterPuesto'
import RoleSelection from '../../../frontend/src/features/auth/pages/RoleSelection'
import CoordinadorDashboard from '../../../frontend/src/features/coordinador/pages/Dashboard'

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

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

function authenticatedUser(roles: string[] = ['CIUDADANO', 'VOLUNTARIO']) {
  mockAuthState.isAuthenticated = true
  mockAuthState.user = {
    id: 'user-1',
    email: 'maria@example.com',
    nombre: 'Maria',
    apellidos: 'Garcia',
    roles,
  }
}

describe('entrada publica', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthState.isAuthenticated = false
    mockAuthState.selectedRole = null
    mockAuthState.user = null
    mockAuthState.puestoId = undefined
  })

  it('muestra login y registro cuando se entra sin cuenta', () => {
    renderWithRouter(<Welcome />)

    expect(screen.getByRole('button', { name: /Registrarse/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Iniciar sesi/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Registrarse/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/auth/register')

    fireEvent.click(screen.getByRole('button', { name: /Iniciar sesi/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/auth/login')
  })
})

describe('registro e inicio de sesion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthState.isAuthenticated = false
    mockAuthState.selectedRole = null
    mockAuthState.user = null
    mockApiPost.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'maria@example.com',
          nombre: 'Maria',
          apellidos: 'Garcia',
          roles: ['CIUDADANO', 'VOLUNTARIO'],
        },
        accessToken: 'token-123',
      },
    })
  })

  it('registra una cuenta con DNI y redirige a seleccionar rol', async () => {
    renderWithRouter(<Register />)

    fireEvent.change(screen.getByPlaceholderText(/Mar/), { target: { value: 'Maria' } })
    fireEvent.change(screen.getByPlaceholderText(/Garc/), { target: { value: 'Garcia' } })
    fireEvent.change(screen.getByPlaceholderText('tu@email.com'), { target: { value: 'maria@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('12345678A'), { target: { value: '12345678a' } })
    fireEvent.change(screen.getByPlaceholderText(/8 caracteres/), { target: { value: 'Password123' } })

    fireEvent.click(screen.getByRole('button', { name: /Crear cuenta/i }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/auth/register', {
        email: 'maria@example.com',
        password: 'Password123',
        nombre: 'Maria',
        apellidos: 'Garcia',
        dni: '12345678A',
      })
    })
    expect(mockLogin).toHaveBeenCalledWith(expect.objectContaining({ email: 'maria@example.com' }), 'token-123')
    expect(mockNavigate).toHaveBeenCalledWith('/seleccionar-rol')
  })

  it.each(['maria@example.com', '12345678A'])(
    'permite iniciar sesion con %s y redirige a seleccionar rol',
    async (identifier) => {
      renderWithRouter(<Login />)

      fireEvent.change(screen.getByPlaceholderText(/tu@email.com o 12345678A/), { target: { value: identifier } })
      fireEvent.change(screen.getByPlaceholderText(/••••••••/), { target: { value: 'Password123' } })
      fireEvent.click(screen.getByRole('button', { name: /Entrar/i }))

      await waitFor(() => {
        expect(mockApiPost).toHaveBeenCalledWith('/api/auth/login', {
          identifier,
          password: 'Password123',
        })
      })
      expect(mockNavigate).toHaveBeenCalledWith('/seleccionar-rol')
    },
  )
})

describe('seleccion de rol y solicitud de puesto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticatedUser()
  })

  it('deja entrar como ciudadano y voluntario, pero ofrece formulario para puesto', () => {
    renderWithRouter(<RoleSelection />)

    expect(screen.getByText('Ciudadano')).toBeInTheDocument()
    expect(screen.getByText('Voluntario / Donante')).toBeInTheDocument()
    expect(screen.queryByText('Puesto de Emergencia')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Ciudadano'))
    expect(mockSelectRole).toHaveBeenCalledWith('ciudadano')
    expect(mockNavigate).toHaveBeenCalledWith('/ciudadano')

    fireEvent.click(screen.getByText('Registrar puesto de emergencia'))
    expect(mockNavigate).toHaveBeenCalledWith('/auth/registro-puesto')
  })

  it('no manda directamente a /puesto si la cuenta aun debe pasar aprobacion', () => {
    authenticatedUser(['CIUDADANO', 'VOLUNTARIO', 'PUESTO_EMERGENCIA'])

    renderWithRouter(<RoleSelection />)

    fireEvent.click(screen.getByText('Puesto de Emergencia'))

    expect(mockSelectRole).not.toHaveBeenCalledWith('puesto')
    expect(mockNavigate).toHaveBeenCalledWith('/auth/registro-puesto')
    expect(mockNavigate).not.toHaveBeenCalledWith('/puesto')
  })

  it('muestra rechazo con motivo y permite reenviar otra solicitud', async () => {
    authenticatedUser()
    mockApiGet.mockResolvedValue({
      data: {
        puesto: {
          id: 'puesto-1',
          nombre: 'CEIP La Paz',
          tipo: 'colegio',
          direccion: 'Calle Mayor 12',
          activo: false,
          estadoSolicitud: 'RECHAZADO',
          motivoRechazo: 'Falta documentacion del responsable',
          createdAt: '2026-05-09T10:00:00.000Z',
        },
      },
    })
    mockApiPost.mockResolvedValue({ data: { puesto: { id: 'puesto-1' } } })

    renderWithQuery(<RegisterPuesto />)

    expect(await screen.findByText('Solicitud rechazada')).toBeInTheDocument()
    expect(screen.getByText('Falta documentacion del responsable')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Enviar nueva solicitud/i }))
    fireEvent.change(screen.getByPlaceholderText(/CEIP La Paz/), { target: { value: 'CEIP La Paz' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'colegio' } })
    fireEvent.change(screen.getByPlaceholderText(/Calle Mayor 12/), { target: { value: 'Calle Mayor 12' } })
    fireEvent.change(screen.getByPlaceholderText('39.4254'), { target: { value: '39.4254' } })
    fireEvent.change(screen.getByPlaceholderText('-0.4178'), { target: { value: '-0.4178' } })
    fireEvent.click(screen.getByRole('button', { name: /^Enviar solicitud$/i }))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/puestos/solicitar', {
        nombre: 'CEIP La Paz',
        tipo: 'colegio',
        direccion: 'Calle Mayor 12',
        descripcion: undefined,
        latitud: 39.4254,
        longitud: -0.4178,
      })
    })
  })
})

describe('coordinador', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticatedUser(['COORDINADOR'])
    mockApiGet.mockResolvedValue({
      data: {
        puestos: [
          {
            id: 'puesto-1',
            nombre: 'CEIP La Paz',
            tipo: 'colegio',
            direccion: 'Calle Mayor 12',
            descripcion: 'Aula de apoyo',
            latitud: 39.4254,
            longitud: -0.4178,
            createdAt: '2026-05-09T10:00:00.000Z',
            admin: {
              id: 'user-1',
              nombre: 'Maria',
              apellidos: 'Garcia',
              email: 'maria@example.com',
              dni: '12345678A',
            },
          },
        ],
      },
    })
    mockApiPatch.mockResolvedValue({ data: {} })
  })

  it('puede aprobar una solicitud de puesto pendiente', async () => {
    renderWithQuery(<CoordinadorDashboard />)

    expect(await screen.findByText('CEIP La Paz')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Aprobar/i }))

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/api/puestos/puesto-1/aprobar')
    })
  })

  it('puede rechazar una solicitud indicando motivo', async () => {
    renderWithQuery(<CoordinadorDashboard />)

    await screen.findByText('CEIP La Paz')
    fireEvent.click(screen.getByRole('button', { name: /^Rechazar$/i }))
    fireEvent.change(screen.getByPlaceholderText(/motivo del rechazo/i), {
      target: { value: 'Falta documentacion' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Confirmar rechazo/i }))

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/api/puestos/puesto-1/rechazar', {
        motivo: 'Falta documentacion',
      })
    })
  })
})
