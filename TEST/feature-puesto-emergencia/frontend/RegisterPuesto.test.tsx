import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockNavigate,
  mockApiGet,
  mockApiPost,
  mockSetPuestoId,
  mockUpdateUser,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
  mockSetPuestoId: vi.fn(),
  mockUpdateUser: vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../../frontend/src/store/auth.store', () => ({
  useAuthStore: vi.fn(() => ({
    isAuthenticated: true,
    setPuestoId: mockSetPuestoId,
    updateUser: mockUpdateUser,
    user: {
      id: 'user-1',
      email: 'maria@example.com',
      nombre: 'Maria',
      apellidos: 'Garcia',
      roles: ['CIUDADANO', 'VOLUNTARIO'],
    },
  })),
}))

vi.mock('../../../frontend/src/hooks/useGeolocation', () => ({
  useGeolocation: vi.fn(() => ({
    position: { lat: 39.4254, lng: -0.4178 },
    loading: false,
    request: vi.fn(),
  })),
}))

vi.mock('../../../frontend/src/lib/api/client', () => ({
  apiClient: {
    get: mockApiGet,
    post: mockApiPost,
  },
}))

import RegisterPuesto from '../../../frontend/src/features/auth/pages/RegisterPuesto'

function renderRegister() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RegisterPuesto />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RegisterPuesto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '39.4254', lon: '-0.4178', display_name: 'Calle Mayor 12, Paiporta, Valencia' }],
    }))
    mockApiGet.mockResolvedValue({ data: { solicitud: null } })
    mockApiPost.mockResolvedValue({ data: { solicitud: { id: 'solicitud-1', estado: 'PENDIENTE' } } })
  })

  it('envia una solicitud de puesto desde el usuario autenticado', async () => {
    renderRegister()

    expect(await screen.findByText('Registrar puesto de emergencia')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/CEIP La Paz/), {
      target: { value: 'CEIP La Paz' },
    })
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'colegio' },
    })
    fireEvent.change(screen.getByPlaceholderText(/Calle Mayor 12/), {
      target: { value: 'Calle Mayor 12, Paiporta, Valencia' },
    })
    fireEvent.change(screen.getByPlaceholderText(/Horario de apertura/), {
      target: { value: 'Aula de apoyo escolar' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar dirección' }))
    await screen.findByText('Ubicación seleccionada correctamente')

    fireEvent.click(screen.getByText('Enviar solicitud'))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/puestos/solicitudes', {
        nombre: 'CEIP La Paz',
        tipo: 'colegio',
        direccion: 'Calle Mayor 12, Paiporta, Valencia',
        descripcion: 'Aula de apoyo escolar',
        latitud: 39.4254,
        longitud: -0.4178,
      })
    })
    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith('/api/puestos/solicitudes/mia')
    })
  })

  it('completa la dirección y las coordenadas al usar la ubicación actual', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ display_name: 'Calle de la Paz 4, Paiporta, Valencia' }),
    } as Response)
    renderRegister()

    await screen.findByText('Registrar puesto de emergencia')
    fireEvent.change(screen.getByPlaceholderText(/CEIP La Paz/), { target: { value: 'CEIP La Paz' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'colegio' } })
    fireEvent.click(screen.getByRole('button', { name: 'Elegir en el mapa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Usar mi ubicación actual' }))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Se completará al elegir un punto')).toHaveValue('Calle de la Paz 4, Paiporta, Valencia')
    })
    fireEvent.click(screen.getByText('Enviar solicitud'))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/puestos/solicitudes', expect.objectContaining({
        direccion: 'Calle de la Paz 4, Paiporta, Valencia',
        latitud: 39.4254,
        longitud: -0.4178,
      }))
    })
  })

  it('muestra el estado pendiente si ya existe una solicitud en revisión', async () => {
    mockApiGet.mockResolvedValue({
      data: {
        solicitud: {
          id: 'solicitud-1',
          nombre: 'CEIP La Paz',
          tipo: 'colegio',
          direccion: 'Calle Mayor 12, Paiporta',
          latitud: 39.4254,
          longitud: -0.4178,
          estado: 'PENDIENTE',
          createdAt: '2026-05-10T10:00:00.000Z',
        },
      },
    })

    renderRegister()

    expect(await screen.findByText('En espera de aprobación')).toBeInTheDocument()
    expect(screen.getAllByText(/CEIP La Paz/).length).toBeGreaterThan(0)
    expect(screen.queryByText('Enviar solicitud')).not.toBeInTheDocument()
  })
})
