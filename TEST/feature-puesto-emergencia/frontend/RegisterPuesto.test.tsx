import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockNavigate,
  mockLogin,
  mockApiPost,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockLogin: vi.fn(),
  mockApiPost: vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../../frontend/src/store/auth.store', () => ({
  useAuthStore: vi.fn(() => ({ login: mockLogin })),
}))

vi.mock('../../../frontend/src/hooks/useGeolocation', () => ({
  useGeolocation: vi.fn(() => ({
    position: { lat: 39.4254, lng: -0.4178 },
    loading: false,
    request: vi.fn(),
  })),
}))

vi.mock('../../../frontend/src/lib/api/client', () => ({
  apiClient: { post: mockApiPost },
}))

import RegisterPuesto from '../../../frontend/src/features/auth/pages/RegisterPuesto'

function renderRegister() {
  return render(
    <MemoryRouter>
      <RegisterPuesto />
    </MemoryRouter>,
  )
}

function fillStep1() {
  fireEvent.change(screen.getByPlaceholderText(/Mar/), { target: { value: 'Maria' } })
  fireEvent.change(screen.getByPlaceholderText(/Garc/), { target: { value: 'Garcia Lopez' } })
  fireEvent.change(screen.getByPlaceholderText('correo@ejemplo.com'), { target: { value: 'maria@example.com' } })
  fireEvent.change(screen.getByPlaceholderText('+34 600 000 000'), { target: { value: '+34600000000' } })
  fireEvent.change(screen.getByPlaceholderText('12345678A'), { target: { value: '12345678A' } })
  fireEvent.change(screen.getByPlaceholderText(/8 caracteres/), { target: { value: 'password123' } })
  fireEvent.change(screen.getByPlaceholderText(/Repite/), { target: { value: 'password123' } })
}

describe('RegisterPuesto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.scrollTo = vi.fn()
    mockApiPost.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'maria@example.com',
          nombre: 'Maria',
          apellidos: 'Garcia Lopez',
          roles: ['PUESTO_EMERGENCIA'],
        },
        puesto: { id: 'puesto-1', nombre: 'CEIP La Paz' },
        accessToken: 'token-123',
      },
    })
  })

  it('valida los datos del responsable antes de avanzar al paso 2', async () => {
    renderRegister()

    fireEvent.click(screen.getByText(/Continuar/))

    expect(await screen.findByText('El nombre es obligatorio')).toBeInTheDocument()
    expect(screen.getByText(/El tel.fono es obligatorio/)).toBeInTheDocument()
    expect(screen.queryByText('Datos del puesto')).not.toBeInTheDocument()
  })

  it('avanza al paso de datos del puesto cuando la cuenta es valida', () => {
    renderRegister()

    fillStep1()
    fireEvent.click(screen.getByText(/Continuar/))

    expect(screen.getByText('Datos del puesto')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/CEIP La Paz/)).toBeInTheDocument()
  })

  it('envia cuenta y puesto al endpoint de registro y guarda puestoId en sesion', async () => {
    renderRegister()

    fillStep1()
    fireEvent.click(screen.getByText(/Continuar/))

    fireEvent.change(screen.getByPlaceholderText(/CEIP La Paz/), {
      target: { value: 'CEIP La Paz' },
    })
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'colegio' },
    })
    fireEvent.change(screen.getByPlaceholderText(/Calle Mayor 12/), {
      target: { value: 'Calle Mayor 12, Paiporta, Valencia' },
    })
    fireEvent.change(screen.getByPlaceholderText('39.4254'), {
      target: { value: '39.4254' },
    })
    fireEvent.change(screen.getByPlaceholderText('-0.4178'), {
      target: { value: '-0.4178' },
    })

    fireEvent.click(screen.getByText('Enviar solicitud de registro'))

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/auth/register', {
        email: 'maria@example.com',
        password: 'password123',
        nombre: 'Maria',
        apellidos: 'Garcia Lopez',
        telefono: '+34600000000',
        dni: '12345678A',
        roles: ['PUESTO_EMERGENCIA'],
        puesto: {
          nombre: 'CEIP La Paz',
          tipo: 'colegio',
          direccion: 'Calle Mayor 12, Paiporta, Valencia',
          descripcion: undefined,
          latitud: 39.4254,
          longitud: -0.4178,
        },
      })
    })
    expect(mockLogin).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'maria@example.com' }),
      'token-123',
      'puesto-1',
    )
    expect(mockNavigate).toHaveBeenCalledWith('/auth/registro-exitoso?role=puesto')
  })
})
