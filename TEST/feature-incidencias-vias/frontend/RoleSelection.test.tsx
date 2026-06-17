import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const {
  mockNavigate,
  mockSelectRole,
  mockLogout,
  mockEndSession,
  mockApiGet,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockSelectRole: vi.fn(),
  mockLogout: vi.fn(),
  mockEndSession: vi.fn(),
  mockApiGet: vi.fn(),
}))

const authState = vi.hoisted(() => ({
  value: {
    isAuthenticated: false,
    user: null as null | {
      id: string
      email: string
      nombre: string
      apellidos: string
      roles: string[]
    },
    selectRole: vi.fn(),
    logout: vi.fn(),
  },
}))

vi.mock('../../../frontend/src/store/auth.store', () => ({
  useAuthStore: vi.fn(() => authState.value),
}))

vi.mock('../../../frontend/src/lib/api/client', () => ({
  endSession: mockEndSession,
  apiClient: {
    get: mockApiGet,
  },
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

import RoleSelection from '../../../frontend/src/features/auth/pages/RoleSelection'

function renderRoleSelection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <QueryClientProvider client={queryClient}>
        <RoleSelection />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('RoleSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockReset()
    mockSelectRole.mockReset()
    mockLogout.mockReset()
    mockEndSession.mockReset()
    mockApiGet.mockResolvedValue({ data: { solicitud: null } })
    authState.value = {
      isAuthenticated: false,
      user: null,
      selectRole: mockSelectRole,
      logout: mockLogout,
    }
  })

  it('muestra los roles disponibles en la pantalla inicial', () => {
    renderRoleSelection()

    expect(screen.getByRole('heading', { name: /quieres participar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /acceder como ciudadano/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /acceder como voluntario/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /acceder como puesto de emergencia/i })).toBeInTheDocument()
    expect(screen.queryByText('Coordinador')).not.toBeInTheDocument()
  })

  it('redirige a login con el rol cuando se elige Ciudadano sin sesion', () => {
    renderRoleSelection()

    fireEvent.click(screen.getByRole('button', { name: /acceder como ciudadano/i }))

    expect(mockSelectRole).toHaveBeenCalledWith('ciudadano')
    expect(mockNavigate).toHaveBeenCalledWith('/auth/login?role=ciudadano')
  })

  it('redirige a login con el rol cuando se elige Voluntario sin sesion', () => {
    renderRoleSelection()

    fireEvent.click(screen.getByRole('button', { name: /acceder como voluntario/i }))

    expect(mockSelectRole).toHaveBeenCalledWith('voluntario')
    expect(mockNavigate).toHaveBeenCalledWith('/auth/login?role=voluntario')
  })

  it('redirige a login con el rol cuando se elige Puesto de Emergencia sin sesion', () => {
    renderRoleSelection()

    fireEvent.click(screen.getByRole('button', { name: /acceder como puesto de emergencia/i }))

    expect(mockSelectRole).toHaveBeenCalledWith('puesto')
    expect(mockNavigate).toHaveBeenCalledWith('/auth/login?role=puesto')
  })

  it('navega al dashboard del rol si ya hay sesion iniciada', () => {
    authState.value = {
      isAuthenticated: true,
      user: {
        id: 'user-1',
        email: 'ana@example.com',
        nombre: 'Ana',
        apellidos: 'Garcia',
        roles: ['CIUDADANO'],
      },
      selectRole: mockSelectRole,
      logout: mockLogout,
    }

    renderRoleSelection()

    expect(screen.getByText(/bienvenido\/a/i)).toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /acceder como ciudadano/i }))

    expect(mockSelectRole).toHaveBeenCalledWith('ciudadano')
    expect(mockNavigate).toHaveBeenCalledWith('/ciudadano')
  })

  it('abre el modal explicativo del rol y lo cierra con el boton principal', () => {
    renderRoleSelection()

    fireEvent.click(screen.getByRole('button', { name: /informaci.n sobre el rol ciudadano/i }))

    const modal = screen.getByRole('dialog', { name: 'Ciudadano' })
    expect(within(modal).getByText(/persona afectada por la emergencia/i)).toBeInTheDocument()
    expect(within(modal).getByText(/ver los puestos de ayuda/i)).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()

    fireEvent.click(within(modal).getByRole('button', { name: 'Entendido' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cierra el modal explicativo al pulsar Escape', () => {
    renderRoleSelection()

    fireEvent.click(screen.getByRole('button', { name: /informaci.n sobre el rol voluntario/i }))
    expect(screen.getByRole('dialog', { name: 'Voluntario' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cierra la sesion desde la pantalla de roles autenticada', () => {
    authState.value = {
      isAuthenticated: true,
      user: {
        id: 'user-1',
        email: 'ana@example.com',
        nombre: 'Ana',
        apellidos: 'Garcia',
        roles: ['CIUDADANO'],
      },
      selectRole: mockSelectRole,
      logout: mockLogout,
    }

    renderRoleSelection()

    fireEvent.click(screen.getByRole('button', { name: /cerrar sesi.n/i }))

    expect(mockEndSession).toHaveBeenCalledTimes(1)
  })
})
