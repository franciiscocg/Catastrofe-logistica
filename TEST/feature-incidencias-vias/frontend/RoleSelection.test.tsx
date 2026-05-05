import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock zustand store — evita leer/escribir localStorage en tests
vi.mock('../../../frontend/src/store/auth.store', () => ({
  useAuthStore: vi.fn(() => ({
    isAuthenticated: false,
    selectRole: vi.fn(),
  })),
}))

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

import RoleSelection from '../../../frontend/src/features/auth/pages/RoleSelection'

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderRoleSelection() {
  return render(
    <MemoryRouter>
      <RoleSelection />
    </MemoryRouter>,
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RoleSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockReset()
  })

  it('muestra las 4 tarjetas de rol', () => {
    renderRoleSelection()
    expect(screen.getByText('Ciudadano')).toBeInTheDocument()
    expect(screen.getByText('Voluntario / Donante')).toBeInTheDocument()
    expect(screen.getByText('Puesto de Emergencia')).toBeInTheDocument()
    expect(screen.getByText('Coordinador')).toBeInTheDocument()
  })

  it('muestra el título de la aplicación', () => {
    renderRoleSelection()
    expect(screen.getByText('Catástrofe Logística')).toBeInTheDocument()
  })

  it('marca Ciudadano como "Acceso libre"', () => {
    renderRoleSelection()
    const badges = screen.getAllByText('Acceso libre')
    expect(badges.length).toBeGreaterThanOrEqual(1)
  })

  it('marca los roles con registro como "Requiere registro"', () => {
    renderRoleSelection()
    const badges = screen.getAllByText('Requiere registro')
    expect(badges).toHaveLength(3) // Voluntario, Puesto, Coordinador
  })

  it('navega directamente a /ciudadano sin pasar por login', () => {
    renderRoleSelection()
    fireEvent.click(screen.getByText('Ciudadano'))
    expect(mockNavigate).toHaveBeenCalledWith('/ciudadano')
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining('login'))
  })

  it('redirige a login con el rol cuando se elige Voluntario sin sesión', () => {
    renderRoleSelection()
    fireEvent.click(screen.getByText('Voluntario / Donante'))
    expect(mockNavigate).toHaveBeenCalledWith('/auth/login?role=voluntario')
  })

  it('redirige a login con el rol cuando se elige Coordinador sin sesión', () => {
    renderRoleSelection()
    fireEvent.click(screen.getByText('Coordinador'))
    expect(mockNavigate).toHaveBeenCalledWith('/auth/login?role=coordinador')
  })

  it('muestra el aviso de funcionamiento offline', () => {
    renderRoleSelection()
    // El texto está dividido: "funciona" en texto plano + <strong>sin conexión</strong>
    // getByText no cruza elementos — buscamos el <strong> directamente
    expect(screen.getByText(/sin conexión/i)).toBeInTheDocument()
  })
})
